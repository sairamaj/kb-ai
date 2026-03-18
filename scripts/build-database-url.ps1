param(
  # PostgreSQL admin username (Terraform default: "pgadmin")
  [Parameter(Mandatory = $false)]
  [string]$PgAdminLogin = "pgadmin",

  # Flexible Server name (used in Azure admin username: "<login>@<server-name>")
  # Example: promptkb-pg
  [Parameter(Mandatory = $false)]
  [string]$PgServerName = "",

  # PostgreSQL admin password (will be URL-encoded)
  [Parameter(Mandatory = $true)]
  [string]$PgAdminPassword,

  # Flexible server FQDN (example: promptkb-pg.postgres.database.azure.com)
  [Parameter(Mandatory = $false)]
  [string]$PgHost = "",

  [Parameter(Mandatory = $false)]
  [int]$PgPort = 5432,

  # Primary database name (Terraform default: "promptkb")
  [Parameter(Mandatory = $false)]
  [string]$PgDatabaseName = "promptkb"
)

function UrlEncode-String {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InputString
  )

  # RFC 3986 style encoding suitable for PostgreSQL connection strings.
  return [System.Uri]::EscapeDataString($InputString)
}

if ([string]::IsNullOrWhiteSpace($PgServerName)) {
  throw "PgServerName is required (the server-name part used after @ in the Azure admin username)."
}

if ([string]::IsNullOrWhiteSpace($PgHost)) {
  throw "PgHost is required (the Flexible Server FQDN)."
}

# Azure admin username format:
#   <login>@<server-name>
$userInfo = "$PgAdminLogin@$PgServerName"
$encodedUserInfo = UrlEncode-String -InputString $userInfo
$encodedPassword = UrlEncode-String -InputString $PgAdminPassword

$databaseUrl = "postgresql+asyncpg://$encodedUserInfo`:$encodedPassword@$PgHost`:$PgPort/$PgDatabaseName"
$databaseUrl

