import csv
import io
from datetime import date, datetime
from typing import Any

from fastapi.responses import StreamingResponse


def _stringify(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def rows_to_csv_response(rows: list[dict[str, Any]], filename: str) -> StreamingResponse:
    """Turn a list of dicts into a downloadable CSV response.

    Column order follows the first row's keys; empty input still returns a
    valid (headerless) CSV rather than erroring.
    """
    buffer = io.StringIO()
    if rows:
        writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        for row in rows:
            writer.writerow({k: _stringify(v) for k, v in row.items()})
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
