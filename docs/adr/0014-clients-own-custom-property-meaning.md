# Clients own custom property meaning

The backend validates Custom Property Schemas and values but assigns no application meaning to
property names, including `viewed`. UI and MCP clients inspect the schema and register a missing
client convention through the schema upsert API without overwriting an existing definition during
bootstrap; failure to verify the schema disables only dependent operations rather than client
startup. This keeps the backend reusable across clients with different tab and link behaviors at
the cost of making those clients responsible for their conventions.
