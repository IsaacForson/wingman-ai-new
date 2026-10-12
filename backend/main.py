"""Entry point: ``python main.py`` (development) or the PyInstaller binary."""

import uvicorn

from wingman.app import create_app, setup_logging
from wingman.config import get_settings


def main() -> None:
    settings = get_settings()
    setup_logging(settings)
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, log_level=settings.log_level.lower())


if __name__ == "__main__":
    main()
