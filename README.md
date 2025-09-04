# CloudNativePG MCP Server by Axians

A Model Context Protocol (MCP) server for managing CloudNativePG PostgreSQL clusters through Claude Desktop and other MCP clients.

Developed by Axians for the Kubernetes and PostgreSQL community.

## Features

### 🚀 **Production-Ready PostgreSQL Management**
Complete lifecycle management of CloudNativePG clusters with **13 core tools** covering:

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

## Available Tools (13 Core Tools)

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

## Usage

### 🎯 **Basic Operations**
- "List my PostgreSQL clusters" - Shows all clusters across namespaces
- "Show me the status of my production cluster in the dba-test namespace"
- "What pods are running for the production cluster?"
- "Get details about the staging cluster"
- "Scale my production cluster to 5 instances"

### 💾 **Backup & Restore Operations**
- "Create a backup of my production cluster"
- "List all backups in the production namespace"
- "Show me backups for my staging cluster only"
- "Get detailed information about backup 'prod-backup-20241204'"
- "Restore a new cluster 'production-restored' from backup 'prod-backup-20241204'"
- "Delete old backup 'staging-backup-20241201' to free up space"

### 📊 **Monitoring & Troubleshooting**
- "Show me the status of my production cluster"
- "Get detailed information about my staging cluster"
- "What pods are running for the production cluster?"
- "Show me events for my production cluster to troubleshoot issues"
- "What events occurred when my cluster failed to start?"

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

For **full functionality** with all 13 tools:

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
