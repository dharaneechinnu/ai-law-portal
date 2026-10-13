"""Demo server for screenshots: the real app with a scripted stand-in model, a word-hash embedder and a sample
eCourts feed. Retrieval, matching, policy, approvals and audit are the real code."""
import hashlib, json, math, re, sys
from pathlib import Path
from datetime import date, timedelta
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage, SystemMessage
from app.providers.base import EmbeddingProvider, LLMProvider
from app.services import ai_registry, legal_data
from app.main import app  # noqa

DIM = 768
class HashEmbedder(EmbeddingProvider):
    async def embed(self, texts):
        out = []
        for t in texts:
            v = [0.0] * DIM
            for w in re.findall(r"[a-z0-9]+", t.lower()):
                if len(w) > 2:
                    v[int(hashlib.md5(w.encode()).hexdigest(), 16) % DIM] += 1
            n = math.sqrt(sum(x * x for x in v)) or 1
            out.append([x / n for x in v])
        return out

class Agent:
    model_name = "demo-scripted"
    def bind_tools(self, tools): return self
    async def ainvoke(self, messages):
        human = next(m.content for m in reversed(messages) if isinstance(m, HumanMessage))
        up = re.search(r"upload_id=([0-9a-f-]{36})", human); mt = re.search(r"matter_id=([0-9a-f-]{36})", human)
        res = [json.loads(m.content) for m in messages if isinstance(m, ToolMessage)]
        n = len(res)
        call = lambda name, args: AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": f"c{n}-{len(messages)}"}])
        if not (up and mt):
            if n == 0: return call("LIST_TASKS", {})
            tasks = res[0].get("result", {}).get("tasks", [])
            return AIMessage(content="You have %d open task%s: %s." % (len(tasks), "" if len(tasks) == 1 else "s", "; ".join(t["title"] for t in tasks[:4])) if tasks else "You have no open tasks.")
        if n == 0: return call("GET_MATTER", {"matter_id": mt.group(1)})
        if n == 1: return call("ATTACH_FILE", {"upload_id": up.group(1), "matter_id": mt.group(1)})
        if n == 2:
            if res[1]["status"] != "executed": return AIMessage(content="OK, I did not file it, so I sent no email.")
            c = res[0]["result"]["matter"]["client"]
            return call("SEND_EMAIL", {"to": [c["email"]], "subject": "Your reply brief", "body": f"Dear {c['name']},\n\nPlease find the reply brief attached.\n\nRegards",
                                       "document_ids": [res[1]["result"]["document_id"]]})
        return AIMessage(content=f"Filed {res[1]['result']['filename']} to the matter and emailed it to {res[0]['result']['matter']['client']['email']}."
                         if res[2]["status"] == "executed" else f"Filed the file. The email was not sent ({res[2]['reason']}).")

class DemoLLM(LLMProvider):
    async def complete(self, messages, **kw):
        system, user = messages[0]["content"], messages[-1]["content"]
        if "legal research assistant" in system:
            return ("The petitioner asks the High Court to quash the FIR under Section 482 CrPC, arguing the dispute is purely civil [1]. "
                    "The key dates are the FIR registration on 14 March 2026 and the next hearing on the interim stay application [1]. "
                    "This is a summary of the documents, not legal advice.")
        if "morning briefing" in system:
            return ("Hearing in Rao v. State of Karnataka is tomorrow; the reply brief task is overdue. "
                    "Today: review the client statement and one new judgment alert on Section 482 quashing.")
        if "compare a law firm's matter" in system:
            return json.dumps({"same": ["Both concern quashing an FIR under Section 482 CrPC", "Both involve a dispute the accused calls civil in nature", "Same court: High Court of Karnataka"],
                               "different": ["The judgment's FIR followed a completed police investigation; ours is at the pre-charge-sheet stage"],
                               "potential_impact": "The judgment sets out when a commercial dispute given a criminal colour can be quashed, which bears on the petition's main ground.",
                               "recommended_review": ["Paragraphs on 'civil dispute with criminal colour'", "How the court treated the delay in filing the FIR"]})
        return "OK"
    async def test_connection(self): return True
    def chat_model(self): return Agent()

class SampleECourts:
    async def get_judgments(self, **f):
        t = date.today()
        court = {"name": "High Court of Karnataka", "external_court_id": "KAHC", "state": "Karnataka", "level": "high"}
        return [
            {"external_judgment_id": "KAHC-2026-1182", "kind": "judgment", "court": court, "external_case_id": "CRLP-4410-2025",
             "title": "M. Suresh v. State of Karnataka", "judgment_date": t - timedelta(days=3), "bench": ["Justice A. Rao"],
             "summary": "FIR quashed under Section 482 CrPC: a commercial dispute over unpaid invoices was given a criminal colour; cheating not made out.",
             "provisions": ["Section 482 CrPC", "Section 420 IPC"], "outcome": "Petition allowed"},
            {"external_judgment_id": "KAHC-2026-1190", "kind": "order", "court": court, "external_case_id": "WP-8812-2026",
             "title": "Lakshmi Traders v. BBMP", "judgment_date": t - timedelta(days=5),
             "summary": "Interim order on property tax reassessment; notice issued to the corporation.", "provisions": ["Article 226"]},
        ]
    async def get_case(self, cid): return {"external_case_id": cid}
    async def get_orders(self, cid): return []

ai_registry.get_llm = lambda db, task="chat": DemoLLM()
ai_registry.get_embedder = lambda db: HashEmbedder()
legal_data.get_provider = lambda db: SampleECourts()
