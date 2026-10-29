from __future__ import annotations

from pathlib import Path
import sys

# Ensure crawler directory is on sys.path for test discovery and module imports
CRAWLER_ROOT = Path(__file__).parent.resolve()
if str(CRAWLER_ROOT) not in sys.path:
    sys.path.insert(0, str(CRAWLER_ROOT))
