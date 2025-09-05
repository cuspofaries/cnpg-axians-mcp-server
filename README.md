# CloudNativePG MCP Server by Axians

A Model Context Protocol (MCP) server for managing CloudNativePG PostgreSQL clusters through Claude Desktop and other MCP clients.

Developed by Axians for the Kubernetes and PostgreSQL community.

## Features

### 🚀 **Production-Ready PostgreSQL Management**
Complete lifecycle management of CloudNativePG clusters with **29 comprehensive tools** covering:

- **Cluster Operations**: Create, delete, scale, pause/resume clusters
- **Backup & Restore**: Manual/scheduled backups, point-in-time recovery
- **High Availability**: Primary switchover, replica clusters, replication monitoring
- **Performance**: Connection pooling, metrics, configuration tuning
- **Security**: TLS certificates, authentication management  
- **Advanced Features**: PostgreSQL upgrades, extensions, tablespaces, logical replication
- **Monitoring**: Logs, metrics, status monitoring, troubleshooting

### 🛠 **Technical Features**
- Built with native Kubernetes SDK (no kubectl dependency)
- Token-based authentication (secure bearer token)
- Cross-namespace operations
- Enterprise-grade PostgreSQL management
- Real-time cluster monitoring

## Installation

### For Claude Desktop Users

Add this to your claude_desktop_config.json:

```json
{
  "mcpServers": {
    "cnpg": {
      "command": "npx",
      "args": ["@cuspofaries/axians-mcp-cnpg-server"],
      "env": {
        "K8S_API_URL": "https://your-k8s-api-server.com",
        "K8S_TOKEN": "your_bearer_token_here"
      }
    }
  }
}
```

### Prerequisites

- Node.js 18+
- Access to a Kubernetes cluster with CloudNativePG installed
- Kubernetes API bearer token

## Configuration

| Environment Variable | Description | Required |
|---------------------|-------------|----------|
| K8S_API_URL | Kubernetes API server URL | Yes |
| K8S_TOKEN | Bearer token for authentication | Yes |

### Getting a Bearer Token

```bash
# For service account token
kubectl create serviceaccount cnpg-mcp
kubectl get secret $(kubectl get sa cnpg-mcp -o jsonpath='{.secrets[0].name}') -o jsonpath='{.data.token}' | base64 -d
```

## Available Tools (29 Comprehensive Tools)

### 📋 **Cluster Management (5 tools)**
- `list_clusters` - List all PostgreSQL clusters across namespaces
- `get_cluster` - Get detailed information about a specific cluster
- `create_cluster` - Create new PostgreSQL clusters with configurable instances, storage, and PostgreSQL version
- `delete_cluster` - Delete PostgreSQL clusters
- `scale_cluster` - Scale cluster to different number of instances

### 🔄 **Backup & Restore Operations (5 tools)**
- `create_backup` - Create manual backups of PostgreSQL clusters
- `list_backups` - List backups for clusters or namespaces with filtering
- `restore_cluster` - Create new cluster from existing backup (Point-in-Time Recovery)
- `get_backup_details` - Get detailed information about a specific backup
- `delete_backup` - Delete backups to free up storage space

### 📊 **Monitoring & Troubleshooting (3 tools)**
- `get_cluster_status` - Get current status and health of clusters with detailed phase information
- `get_cluster_pods` - Get information about pods in a cluster including readiness, restarts, and roles
- `get_cluster_events` - Get Kubernetes events related to a cluster for troubleshooting

### 🔧 **Advanced Operations (16 tools)**
- `create_scheduled_backup` - Set up automated backup schedules with retention policies
- `list_scheduled_backups` - View and manage scheduled backup policies across clusters
- `get_cluster_logs` - Access real-time logs from cluster pods for debugging and monitoring
- `switchover_primary` - Perform controlled primary failover operations for maintenance
- `get_cluster_metrics` - Retrieve Prometheus metrics and performance data
- `pause_cluster` - Hibernate clusters to reduce costs while preserving data
- `resume_cluster` - Wake up hibernated clusters and restore operations
- `patch_cluster_config` - Update PostgreSQL configuration and resource settings live
- `create_replica_cluster` - Set up read replicas and high availability configurations
- `get_cluster_certificates` - Manage and monitor TLS certificates and security settings
- `create_pooler` - Deploy PgBouncer connection pooling for performance optimization
- `upgrade_postgres_version` - Perform in-place PostgreSQL version upgrades safely
- `get_backup_status` - Monitor backup progress and detailed status information
- `create_logical_replica` - Set up logical replication for data synchronization
- `manage_tablespaces` - Configure custom storage locations and performance tuning
- `create_database_declarative` - Provision databases with custom encoding and ownership
- `get_replication_status` - Monitor replication lag and replica health across clusters
- `manage_extensions` - Install and manage PostgreSQL extensions declaratively
- `set_synchronous_replication` - Configure synchronous replication for data consistency

## Usage

Simply ask Claude to perform PostgreSQL operations using natural language. Here are comprehensive examples for all 29 tools:

### 📋 **Cluster Management (5 tools)**

#### `list_clusters`
- *"List all my PostgreSQL clusters"*
- *"Show me all CNPG clusters across all namespaces"*
- *"What PostgreSQL clusters do I have running?"*

#### `get_cluster`
- *"Get details about the 'production' cluster in the 'db' namespace"*
- *"Show me information about my staging cluster"*
- *"What's the configuration of the main-db cluster?"*

#### `create_cluster`
- *"Create a new PostgreSQL cluster called 'analytics' with 3 instances and 50Gi storage"*
- *"Set up a development cluster with PostgreSQL 15 and 2 replicas"*
- *"Create a highly available cluster with 5 instances for production workloads"*

#### `delete_cluster`
- *"Delete the 'test-cluster' in the development namespace"*
- *"Remove the old staging cluster - I don't need it anymore"*
- *"Clean up the temporary cluster we created for testing"*

#### `scale_cluster`
- *"Scale my production cluster to 7 instances for high availability"*
- *"Reduce the development cluster to 2 instances to save resources"*
- *"Scale up the analytics cluster to handle increased load"*

### 🔄 **Backup & Restore Operations (5 tools)**

#### `create_backup`
- *"Create a backup of my production cluster before the maintenance window"*
- *"Take an immediate backup of the analytics cluster"*
- *"Create a backup named 'pre-migration-backup' for the main database"*

#### `list_backups`
- *"Show me all backups for the production cluster"*
- *"List backups in the 'database' namespace from the last week"*
- *"What backups do I have available for disaster recovery?"*

#### `restore_cluster`
- *"Restore a new cluster 'production-restored' from backup 'prod-backup-20241204'"*
- *"Create a new development environment from the latest production backup"*
- *"Restore the analytics cluster to a point-in-time before the data corruption"*

#### `get_backup_details`
- *"Get detailed information about backup 'prod-backup-20241204'"*
- *"Show me the status and metadata of the latest backup"*
- *"What's the size and completion status of backup-20241205-123456?"*

#### `delete_backup`
- *"Delete old backup 'staging-backup-20241101' to free up storage space"*
- *"Clean up backups older than 30 days for cost optimization"*
- *"Remove the temporary backup we created for testing"*

### 📊 **Monitoring & Troubleshooting (3 tools)**

#### `get_cluster_status`
- *"Show me the health status of my production cluster"*
- *"What's the current status of all clusters in the database namespace?"*
- *"Check if my cluster is ready and all replicas are healthy"*

#### `get_cluster_pods`
- *"Show me all pods running in the production cluster"*
- *"What's the status of pods in my staging environment?"*
- *"Which pod is the primary and which are replicas?"*

#### `get_cluster_events`
- *"Show me recent events for the production cluster to troubleshoot the issue"*
- *"What events occurred when my cluster failed to start?"*
- *"Get Kubernetes events for debugging the database connection problems"*

### 🔧 **Advanced Operations (16 tools)**

#### `create_scheduled_backup`
- *"Set up daily backups for the production cluster at 2 AM with 30-day retention"*
- *"Create a weekly backup schedule for the analytics cluster every Sunday"*
- *"Configure automated backups every 6 hours for the critical database"*

#### `list_scheduled_backups`
- *"Show me all scheduled backup policies across all clusters"*
- *"List backup schedules for the production namespace"*
- *"What automated backups are configured for my databases?"*

#### `get_cluster_logs`
- *"Show me the latest logs from the production cluster primary pod"*
- *"Get error logs from the last 100 lines of the database cluster"*
- *"Display PostgreSQL logs from the analytics cluster for debugging"*

#### `switchover_primary`
- *"Perform a controlled failover for the production cluster maintenance"*
- *"Switch the primary to the replica in zone-b for load balancing"*
- *"Initiate primary switchover to test high availability"*

#### `get_cluster_metrics`
- *"Show me performance metrics for the production cluster"*
- *"Get CPU and memory usage statistics for all database pods"*
- *"Display Prometheus metrics for monitoring dashboard"*

#### `pause_cluster`
- *"Hibernate the development cluster to save costs over the weekend"*
- *"Pause the testing cluster - we'll resume it on Monday"*
- *"Put the staging environment in hibernation mode"*

#### `resume_cluster`
- *"Wake up the development cluster for the new sprint"*
- *"Resume the hibernated testing cluster for QA validation"*
- *"Bring the staging environment back online"*

#### `patch_cluster_config`
- *"Update the production cluster to use more memory and enable query logging"*
- *"Modify PostgreSQL parameters for better performance tuning"*
- *"Change the cluster configuration to increase connection limits"*

#### `create_replica_cluster`
- *"Set up a read replica cluster in the DR region from production"*
- *"Create a replica cluster for reporting workloads to offload the primary"*
- *"Deploy a cross-region replica for disaster recovery"*

#### `get_cluster_certificates`
- *"Show me the TLS certificates for the production cluster"*
- *"List all SSL certificates and their expiration dates"*
- *"Check certificate status for secure database connections"*

#### `create_pooler`
- *"Deploy PgBouncer connection pooling for the production cluster"*
- *"Set up a connection pool with session mode for web applications"*
- *"Create a pooler with 100 max connections for high-traffic scenarios"*

#### `upgrade_postgres_version`
- *"Upgrade the production cluster to PostgreSQL 16 safely"*
- *"Update the development cluster to the latest PostgreSQL version"*
- *"Perform a rolling upgrade to PostgreSQL 15.4"*

#### `get_backup_status`
- *"Check the progress of the backup 'prod-backup-20241205-143022'"*
- *"Show me detailed status of the currently running backup"*
- *"Monitor the backup completion and verify integrity"*

#### `create_logical_replica`
- *"Set up logical replication from production to the analytics cluster"*
- *"Create a logical replica for real-time data synchronization"*
- *"Configure logical replication for selective table replication"*

#### `manage_tablespaces`
- *"Add a fast SSD tablespace to the production cluster for indexes"*
- *"Create a separate tablespace for archive data on slower storage"*
- *"Configure custom tablespaces for performance optimization"*

#### `create_database_declarative`
- *"Create a new 'analytics' database with UTF8 encoding owned by analyst_user"*
- *"Add a database for the new microservice with specific collation"*
- *"Set up a database for the reporting application"*

#### `get_replication_status`
- *"Check replication lag between primary and all replicas"*
- *"Show me the health status of streaming replication"*
- *"Monitor replica synchronization across all clusters"*

#### `manage_extensions`
- *"Install PostGIS and pg_stat_statements extensions on the analytics cluster"*
- *"Enable the pgcrypto extension for encryption capabilities"*
- *"Add TimescaleDB extension for time-series data"*

#### `set_synchronous_replication`
- *"Enable synchronous replication for the production cluster for data consistency"*
- *"Configure synchronous replication with 2 replicas for critical data"*
- *"Set up sync replication to prevent data loss during failures"*

### 💡 **Pro Tips for Usage**
- Combine operations: *"Create a backup, then scale my cluster to 5 instances"*
- Use specific names: *"Show metrics for the 'ecommerce-prod' cluster in 'production' namespace"*
- Context-aware requests: *"Before upgrading PostgreSQL, create a backup and check cluster health"*
- Monitoring workflows: *"Check cluster status, then show me any error events from the last hour"*

## Examples

### Basic Usage

```bash
# Test the server locally
npx @cuspofaries/axians-mcp-cnpg-server
```

### Advanced Configuration

```json
{
  "mcpServers": {
    "cnpg-production": {
      "command": "npx",
      "args": ["@cuspofaries/axians-mcp-cnpg-server"],
      "env": {
        "K8S_API_URL": "https://prod-k8s.company.com",
        "K8S_TOKEN": "prod_token_here"
      }
    },
    "cnpg-staging": {
      "command": "npx", 
      "args": ["@cuspofaries/axians-mcp-cnpg-server"],
      "env": {
        "K8S_API_URL": "https://staging-k8s.company.com",
        "K8S_TOKEN": "staging_token_here"
      }
    }
  }
}
```

## Troubleshooting

### Common Issues

- **Authentication errors**: Verify your K8S_TOKEN has proper RBAC permissions
- **Connection refused**: Check K8S_API_URL is accessible from your machine
- **No clusters found**: Ensure CloudNativePG is installed in your cluster

### Required RBAC permissions

For **full functionality** with all 29 tools:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cnpg-mcp-server
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cnpg-mcp-manager
rules:
# CloudNativePG Resources (Full Management)
- apiGroups: ["postgresql.cnpg.io"]
  resources: ["clusters", "backups", "scheduledbackups", "poolers"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
# Kubernetes Core Resources
- apiGroups: [""]
  resources: ["pods", "pods/log", "secrets", "namespaces"]
  verbs: ["get", "list", "watch"]
# Additional permissions for advanced features
- apiGroups: [""]
  resources: ["persistentvolumeclaims"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: cnpg-mcp-server-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cnpg-mcp-manager
subjects:
- kind: ServiceAccount
  name: cnpg-mcp-server
  namespace: default
---
# Token secret for authentication
apiVersion: v1
kind: Secret
metadata:
  name: cnpg-mcp-server-token
  namespace: default
  annotations:
    kubernetes.io/service-account.name: cnpg-mcp-server
type: kubernetes.io/service-account-token
```

### 🔒 **Read-Only RBAC** (for monitoring/viewing only)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cnpg-mcp-reader
rules:
- apiGroups: ["postgresql.cnpg.io"]
  resources: ["clusters", "backups", "scheduledbackups", "poolers"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["pods", "pods/log", "secrets", "namespaces"]
  verbs: ["get", "list", "watch"]
```

## Development

```bash
git clone https://github.com/cuspofaries/cnpg-axians-mcp-server.git
cd cnpg-axians-mcp-server
npm install
npm run build
npm start
```

## Contributing

We welcome contributions! Please see our Contributing Guide.

## About Axians

This project is developed by Axians, a VINCI Energies brand, specializing in ICT solutions and services.

## Support

- Report Issues: https://github.com/cuspofaries/cnpg-axians-mcp-server/issues
- Discussions: https://github.com/cuspofaries/cnpg-axians-mcp-server/discussions
- Email: anthony.macle@axians.com

## License

MIT

[![MCP Badge](https://lobehub.com/badge/mcp/cuspofaries-cnpg-axians-mcp-server)](https://lobehub.com/mcp/cuspofaries-cnpg-axians-mcp-server)
