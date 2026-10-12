"""EmailProvider over plain SMTP, so any mail server works (Microsoft 365, Google Workspace, SES, Postfix...)."""
import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import make_msgid

from app.providers.base import Attachment, EmailProvider


class SmtpEmailProvider(EmailProvider):
    def __init__(self, host: str, port: int, security: str, username: str | None, password: str | None, sender: str):
        self.host, self.port, self.security = host, port, security  # security: starttls / ssl / none
        self.username, self.password, self.sender = username, password, sender

    def _connect(self) -> smtplib.SMTP:
        if self.security == "ssl":
            smtp = smtplib.SMTP_SSL(self.host, self.port, timeout=20, context=ssl.create_default_context())
        else:
            smtp = smtplib.SMTP(self.host, self.port, timeout=20)
            if self.security == "starttls":
                smtp.starttls(context=ssl.create_default_context())
        if self.username:
            smtp.login(self.username, self.password or "")
        return smtp

    def _send(self, to: list[str], subject: str, body: str, attachments: list[Attachment] | None) -> str:
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = self.sender, ", ".join(to), subject
        msg["Message-ID"] = make_msgid()
        msg.set_content(body)
        for filename, mime, data in attachments or []:
            maintype, _, subtype = (mime if "/" in mime else "application/octet-stream").partition("/")
            msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=filename)
        with self._connect() as smtp:
            smtp.send_message(msg)
        return msg["Message-ID"]

    async def send(self, to: list[str], subject: str, body: str, attachments: list[Attachment] | None = None) -> str:
        return await asyncio.to_thread(self._send, to, subject, body, attachments)

    async def test_connection(self) -> bool:
        def _check() -> bool:
            with self._connect() as smtp:
                return smtp.noop()[0] == 250
        return await asyncio.to_thread(_check)
