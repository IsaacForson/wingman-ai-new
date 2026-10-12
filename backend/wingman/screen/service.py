"""Manual screen capture + OCR. Runs in worker threads so the event loop stays free."""

from __future__ import annotations

import asyncio

from loguru import logger


class ScreenUnavailable(Exception):
    pass


class ScreenService:
    def __init__(self) -> None:
        self._error: str | None = None
        try:
            import mss  # noqa: F401
            import pytesseract

            pytesseract.get_tesseract_version()
        except Exception as e:  # missing package or tesseract binary
            self._error = (
                "Screen text capture needs Tesseract. Install it (macOS: brew install tesseract) and restart Wingman."
            )
            logger.warning("Screen capture unavailable: {}", e)

    @property
    def available(self) -> bool:
        return self._error is None

    @staticmethod
    def _capture_and_ocr(monitor: int) -> str:
        import mss
        import pytesseract
        from PIL import Image, ImageOps

        with mss.mss() as sct:
            monitors = sct.monitors
            shot = sct.grab(monitors[monitor if monitor < len(monitors) else 1])
            image = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        gray = ImageOps.grayscale(image)
        if gray.width < 2000:  # upscale small captures; Tesseract likes larger glyphs
            gray = gray.resize((gray.width * 2, gray.height * 2))
        text = pytesseract.image_to_string(gray, config="--psm 3")
        lines = [line.rstrip() for line in text.splitlines()]
        return "\n".join(line for line in lines if line.strip())

    async def capture_text(self, monitor: int = 1) -> str:
        if self._error:
            raise ScreenUnavailable(self._error)
        text = await asyncio.to_thread(self._capture_and_ocr, monitor)
        if len(text.strip()) < 10:
            raise ScreenUnavailable("No readable text was found on the screen.")
        return text[:12000]
