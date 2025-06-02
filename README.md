# CloudNativePG MCP Server by Axians

A Model Context Protocol (MCP) server for managing CloudNativePG PostgreSQL clusters through Claude Desktop and other MCP clients.

Developed by Axians for the Kubernetes and PostgreSQL community.

## Features

- List PostgreSQL clusters across all namespaces
- Get detailed cluster information  
- Check cluster status and health
- View cluster pods and their status
- Built with native Kubernetes SDK (no kubectl dependency)
- Token-based authentication (like ArgoCD MCP)

## Installation

### For Claude Desktop Users

Add this to your claude_desktop_config.json:

```json
{
  "mcpServers": {
    "cnpg": {
      "command": "npx",
      "args": ["@cnpg/axians-mcp-server"],
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

## Usage

Once configured, you can ask Claude:

- "List my PostgreSQL clusters" - Shows all clusters across namespaces
- "Show me the status of my production cluster in the dba-test namespace"
- "What pods are running for the production cluster?"
- "Get details about the staging cluster"

## Examples

### Basic Usage

```bash
# Test the server locally
npx @cnpg/axians-mcp-server
```

### Advanced Configuration

```json
{
  "mcpServers": {
    "cnpg-production": {
      "command": "npx",
      "args": ["@cnpg/axians-mcp-server"],
      "env": {
        "K8S_API_URL": "https://prod-k8s.company.com",
        "K8S_TOKEN": "prod_token_here"
      }
    },
    "cnpg-staging": {
      "command": "npx", 
      "args": ["@cnpg/axians-mcp-server"],
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

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cnpg-mcp-reader
rules:
- apiGroups: ["postgresql.cnpg.io"]
  resources: ["clusters"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list"]
```

## Development

```bash
git clone https://github.com/anthony-macle/cnpg-axians-mcp-server.git
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

- Report Issues: https://github.com/anthony-macle/cnpg-axians-mcp-server/issues
- Discussions: https://github.com/anthony-macle/cnpg-axians-mcp-server/discussions
- Email: anthony.macle@axians.com

## License

MIT