#
# Azure Database for PostgreSQL - Flexible Server
#

resource "azurerm_postgresql_flexible_server" "promptkb" {
  name                = var.pg_server_name
  resource_group_name = data.azurerm_resource_group.promptkb.name
  location            = data.azurerm_resource_group.promptkb.location

  version                      = var.pg_version
  sku_name                     = var.pg_sku_name
  storage_mb                   = var.pg_storage_mb
  backup_retention_days        = var.pg_backup_retention_days
  geo_redundant_backup_enabled = var.pg_geo_redundant_backup_enabled

  # High availability is optional and depends on regional support.
  dynamic "high_availability" {
    for_each = var.pg_ha_enabled ? [1] : []
    content {
      mode = "ZoneRedundant"
    }
  }

  administrator_login    = var.pg_admin_login
  administrator_password = var.pg_admin_password

  public_network_access_enabled = var.pg_public_network_access_enabled
}

resource "azurerm_postgresql_flexible_server_database" "promptkb" {
  name      = var.pg_database_name
  server_id = azurerm_postgresql_flexible_server.promptkb.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "promptkb" {
  for_each  = var.pg_firewall_rules
  name      = each.key
  server_id = azurerm_postgresql_flexible_server.promptkb.id

  start_ip_address = each.value.start_ip
  end_ip_address   = each.value.end_ip
}

