def _build_filter_clause(
    device_type: str | None = None,
    holder_bucket: str | None = None,
    status: str | None = None,
    grn_source_bucket: str | None = None,
) -> str:
    """Build an additional SQL filter clause for optional query params.

    Returns a string starting with 'AND ...' if any filter is set, or an empty
    string if none are provided.  Intended to be appended after an existing
    WHERE clause, or converted to a standalone WHERE clause when there is none.
    """
    clauses = []
    if device_type:
        safe = device_type.replace("'", "''")
        clauses.append(f"DEVICE_TYPE_NORMALIZED = '{safe}'")
    if holder_bucket:
        safe = holder_bucket.replace("'", "''")
        clauses.append(f"HOLDER_BUCKET = '{safe}'")
    if status:
        safe = status.replace("'", "''")
        clauses.append(f"STATUS_NORMALIZED = '{safe}'")
    if grn_source_bucket:
        safe = grn_source_bucket.replace("'", "''")
        clauses.append(f"GRN_SOURCE_BUCKET = '{safe}'")
    return ("AND " + " AND ".join(clauses)) if clauses else ""


def where_or_and(filter_clause: str, existing_where: bool = False) -> str:
    """Return a complete WHERE / AND fragment for inserting into SQL.

    existing_where=True  → the query already has a WHERE clause; prepend AND.
    existing_where=False → no existing WHERE; convert leading AND to WHERE.
    """
    if not filter_clause:
        return ""
    if existing_where:
        return f" {filter_clause}"
    return " WHERE " + (filter_clause[4:] if filter_clause.startswith("AND ") else filter_clause)
