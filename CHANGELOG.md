# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-12-04

### 🚀 Major Release - Production-Ready PostgreSQL Management

This release transforms the CNPG MCP Server from a basic cluster viewer into a production-ready PostgreSQL management platform with **13 core tools** covering essential database operations including complete backup lifecycle management and troubleshooting capabilities.

### ✨ Added - Production-Ready Core Features

#### 📋 **Enhanced Cluster Management (5 tools)**
- `list_clusters` - List PostgreSQL clusters across namespaces (enhanced)
- `get_cluster` - Get detailed cluster information (enhanced)
- `create_cluster` - Create new PostgreSQL clusters with full configuration
- `delete_cluster` - Delete PostgreSQL clusters safely
- `scale_cluster` - Scale cluster instances dynamically

#### 🔄 **Complete Backup Lifecycle (5 tools)**
- `create_backup` - Create manual backups with auto-generated names
- `list_backups` - List and filter backups by cluster or namespace
- `restore_cluster` - Create new cluster from backup with Point-in-Time Recovery
- `get_backup_details` - Get comprehensive backup information and status
- `delete_backup` - Delete backups to manage storage and cleanup

#### 📊 **Monitoring & Troubleshooting (3 tools)**
- `get_cluster_status` - Get comprehensive cluster status and health information
- `get_cluster_pods` - Get detailed pod information including roles and readiness
- `get_cluster_events` - Get Kubernetes events for cluster troubleshooting and debugging

### 🛠 **Enhanced**
- **Comprehensive Error Handling**: All tools include robust error handling and validation
- **RBAC Documentation**: Complete permissions for full management vs read-only access
- **Usage Examples**: 25+ real-world examples across all tool categories
- **Enterprise Features**: Support for hibernation, upgrades, advanced replication

### 📚 **Documentation**
- **Complete Tool Reference**: All 13 tools documented with descriptions and use cases
- **Enhanced Usage Guide**: Practical examples for all major operations
- **RBAC Configurations**: Both full management and read-only permission sets
- **Advanced Examples**: Multi-environment configurations

### 🔧 **Technical Improvements**
- **Interface Definitions**: Comprehensive TypeScript interfaces for all operations
- **API Constants**: Support for additional CNPG resources (Poolers, ScheduledBackups)
- **Code Organization**: Structured implementation with clear separation of concerns

## [1.0.0] - 2024-11-XX

### Added
- Initial release with basic CNPG cluster management
- `list_clusters` - List PostgreSQL clusters across namespaces
- `get_cluster` - Get detailed cluster information
- `create_cluster` - Create new PostgreSQL clusters
- `delete_cluster` - Delete PostgreSQL clusters
- `scale_cluster` - Scale cluster instances
- `get_cluster_status` - Get cluster health status
- `get_cluster_pods` - Get pod information
- Basic Kubernetes API integration
- Token-based authentication
- Cross-namespace operations

[2.0.0]: https://github.com/cuspofaries/cnpg-axians-mcp-server/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/cuspofaries/cnpg-axians-mcp-server/releases/tag/v1.0.0