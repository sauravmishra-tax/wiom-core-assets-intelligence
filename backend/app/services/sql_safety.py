def escape_literal(value: str) -> str:
    """Escape a value for interpolation into a single-quoted SQL literal.

    The Metabase native-query endpoint used by WarehouseClient doesn't expose
    Snowflake bind parameters over this transport, so free-text search input
    is escaped here instead of parameterized. Only used for equality/LIKE
    string literals - never for identifiers, column names, or SQL keywords.
    """
    return value.replace("'", "''")
