#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { 
  KubeConfig, 
  CoreV1Api, 
  CustomObjectsApi,
  V1Pod 
} from '@kubernetes/client-node';

class CNPGMCPServer {
  private server: Server;
  private k8sApi: CoreV1Api;
  private customApi: CustomObjectsApi;

  constructor() {
    this.server = new Server(
      { name: 'cnpg-mcp-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.setupKubernetesClient();
    this.setupToolHandlers();
  }

  private setupKubernetesClient() {
    const kc = new KubeConfig();
    
    if (process.env.K8S_API_URL && process.env.K8S_TOKEN) {
      // Configuration par token (recommandée pour MCP)
      kc.loadFromOptions({
        clusters: [{
          name: 'mcp-cluster',
          cluster: {
            server: process.env.K8S_API_URL,
            skipTLSVerify: true // Pour simplifier, à adapter selon tes besoins
          }
        }],
        users: [{
          name: 'mcp-user',
          user: {
            token: process.env.K8S_TOKEN
          }
        }],
        contexts: [{
          name: 'mcp-context',
          context: {
            cluster: 'mcp-cluster',
            user: 'mcp-user'
          }
        }],
        currentContext: 'mcp-context'
      });
    } else {
      // Fallback vers kubeconfig par défaut
      kc.loadFromDefault();
    }

    this.k8sApi = kc.makeApiClient(CoreV1Api);
    this.customApi = kc.makeApiClient(CustomObjectsApi);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'list_clusters',
            description: 'List all PostgreSQL clusters across all namespaces',
            inputSchema: {
              type: 'object',
              properties: {
                namespace: {
                  type: 'string',
                  description: 'Optional: filter by specific namespace'
                }
              }
            }
          },
          {
            name: 'get_cluster',
            description: 'Get detailed information about a specific PostgreSQL cluster',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' }
              },
              required: ['name', 'namespace']
            }
          },
          {
            name: 'get_cluster_status',
            description: 'Get the current status and health of a PostgreSQL cluster',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' }
              },
              required: ['name', 'namespace']
            }
          },
          {
            name: 'get_cluster_pods',
            description: 'Get information about pods in a PostgreSQL cluster',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' }
              },
              required: ['name', 'namespace']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'list_clusters':
            return await this.listClusters(args.namespace);
          
          case 'get_cluster':
            return await this.getCluster(args.name, args.namespace);
          
          case 'get_cluster_status':
            return await this.getClusterStatus(args.name, args.namespace);
          
          case 'get_cluster_pods':
            return await this.getClusterPods(args.name, args.namespace);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    });
  }

  private async listClusters(namespace?: string) {
    try {
      let response: any;
      
      if (namespace) {
        // Namespace spécifique
        response = await this.customApi.listNamespacedCustomObject(
          'postgresql.cnpg.io',
          'v1',
          namespace,
          'clusters'
        );
      } else {
        // Tous les namespaces
        response = await this.customApi.listClusterCustomObject(
          'postgresql.cnpg.io',
          'v1',
          'clusters'
        );
      }

      const clusters = (response.body as any).items || [];
      
      if (clusters.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: namespace 
                ? `No PostgreSQL clusters found in namespace "${namespace}"`
                : 'No PostgreSQL clusters found in any namespace'
            }
          ]
        };
      }

      const clusterInfo = clusters.map((cluster: any) => {
        const name = cluster.metadata.name;
        const ns = cluster.metadata.namespace;
        const instances = cluster.spec.instances || 'Unknown';
        const status = cluster.status?.phase || 'Unknown';
        const readyInstances = cluster.status?.readyInstances || 0;
        
        return `• **${name}** (namespace: ${ns})
  - Instances: ${readyInstances}/${instances} ready
  - Status: ${status}`;
      }).join('\n\n');

      const title = namespace 
        ? `## PostgreSQL Clusters in "${namespace}"`
        : '## PostgreSQL Clusters (All Namespaces)';

      return {
        content: [
          {
            type: 'text',
            text: `${title}\n\n${clusterInfo}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list clusters: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getCluster(name: string, namespace: string) {
    try {
      const response = await this.customApi.getNamespacedCustomObject(
        'postgresql.cnpg.io',
        'v1',
        namespace,
        'clusters',
        name
      );

      const cluster = response.body as any;
      
      return {
        content: [
          {
            type: 'text',
            text: `## Cluster: ${name}\n\n\`\`\`json\n${JSON.stringify(cluster, null, 2)}\n\`\`\``
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get cluster: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getClusterStatus(name: string, namespace: string) {
    try {
      const response = await this.customApi.getNamespacedCustomObject(
        'postgresql.cnpg.io',
        'v1',
        namespace,
        'clusters',
        name
      );

      const cluster = response.body as any;
      const status = cluster.status || {};
      
      const statusInfo = `## Cluster Status: ${name}

**Phase:** ${status.phase || 'Unknown'}
**Ready Instances:** ${status.readyInstances || 0}/${cluster.spec.instances || 'Unknown'}
**Primary Instance:** ${status.currentPrimary || 'Unknown'}

**Conditions:**
${(status.conditions || []).map((cond: any) => 
  `• ${cond.type}: ${cond.status} ${cond.reason ? `(${cond.reason})` : ''}`
).join('\n')}`;

      return {
        content: [
          {
            type: 'text',
            text: statusInfo
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get cluster status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getClusterPods(name: string, namespace: string) {
    try {
      const response = await this.k8sApi.listNamespacedPod(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `cnpg.io/cluster=${name}`
      );

      const pods = response.body.items;

      if (pods.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No pods found for cluster "${name}" in namespace "${namespace}"`
            }
          ]
        };
      }

      const podInfo = pods.map((pod: V1Pod) => {
        const podName = pod.metadata?.name || 'Unknown';
        const status = pod.status?.phase || 'Unknown';
        const ready = pod.status?.containerStatuses?.[0]?.ready ? '✅' : '❌';
        const restarts = pod.status?.containerStatuses?.[0]?.restartCount || 0;
        
        return `• **${podName}**
  - Status: ${status} ${ready}
  - Restarts: ${restarts}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `## Pods for Cluster: ${name}\n\n${podInfo}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get cluster pods: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('CloudNativePG MCP server running on stdio');
  }
}

// Lancer le serveur
if (require.main === module) {
  const server = new CNPGMCPServer();
  server.run().catch(console.error);
}