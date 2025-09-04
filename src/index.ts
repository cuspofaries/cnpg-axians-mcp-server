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

// CNPG API details
const CNPG_GROUP = "postgresql.cnpg.io";
const CNPG_VERSION = "v1";
const CLUSTER_PLURAL = "clusters";
const BACKUP_PLURAL = "backups";
const SCHEDULED_BACKUP_PLURAL = "scheduledbackups";
const POOLER_PLURAL = "poolers";

interface ClusterArgs {
  name: string;
  namespace: string;
  instances?: number;
  storageSize?: string;
  postgresVersion?: string;
  storageClass?: string;
}

interface BackupArgs {
  clusterName: string;
  namespace: string;
  backupName?: string;
}

interface RestoreArgs {
  newClusterName: string;
  namespace: string;
  backupName: string;
  instances?: number;
  storageSize?: string;
  storageClass?: string;
}

class CNPGMCPServer {
  private server: Server;
  private k8sApi!: CoreV1Api;
  private customApi!: CustomObjectsApi;

  constructor() {
    this.server = new Server(
      { name: 'cnpg-mcp-server', version: '2.0.0' },
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
          server: process.env.K8S_API_URL,
          skipTLSVerify: true
        }],
        users: [{
          name: 'mcp-user',
          token: process.env.K8S_TOKEN
        }],
        contexts: [{
          name: 'mcp-context',
          cluster: 'mcp-cluster',
          user: 'mcp-user'
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
            name: 'create_cluster',
            description: 'Create a new PostgreSQL cluster',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace to create the cluster in' },
                instances: { type: 'number', description: 'Number of PostgreSQL instances (default: 3)', default: 3 },
                storageSize: { type: 'string', description: 'Storage size (e.g., "10Gi")', default: '10Gi' },
                postgresVersion: { type: 'string', description: 'PostgreSQL version (default: "15")', default: '15' },
                storageClass: { type: 'string', description: 'Storage class name (optional)' }
              },
              required: ['name', 'namespace']
            }
          },
          {
            name: 'delete_cluster',
            description: 'Delete a PostgreSQL cluster',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name of the cluster to delete' },
                namespace: { type: 'string', description: 'Namespace of the cluster' }
              },
              required: ['name', 'namespace']
            }
          },
          {
            name: 'scale_cluster',
            description: 'Scale a PostgreSQL cluster to a different number of instances',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' },
                instances: { type: 'number', description: 'New number of instances' }
              },
              required: ['name', 'namespace', 'instances']
            }
          },
          {
            name: 'create_backup',
            description: 'Create a manual backup of a PostgreSQL cluster',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster to backup' },
                namespace: { type: 'string', description: 'Namespace of the cluster' },
                backupName: { type: 'string', description: 'Name for the backup (optional, auto-generated if not provided)' }
              },
              required: ['clusterName', 'namespace']
            }
          },
          {
            name: 'list_backups',
            description: 'List backups for a cluster or all backups in a namespace',
            inputSchema: {
              type: 'object',
              properties: {
                namespace: { type: 'string', description: 'Namespace to list backups from' },
                clusterName: { type: 'string', description: 'Filter backups by cluster name (optional)' }
              },
              required: ['namespace']
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
          },
          {
            name: 'restore_cluster',
            description: 'Create a new PostgreSQL cluster from an existing backup (Point-in-Time Recovery)',
            inputSchema: {
              type: 'object',
              properties: {
                newClusterName: { type: 'string', description: 'Name for the new cluster' },
                namespace: { type: 'string', description: 'Namespace to create the cluster in' },
                backupName: { type: 'string', description: 'Name of the backup to restore from' },
                instances: { type: 'number', description: 'Number of PostgreSQL instances (default: 3)', default: 3 },
                storageSize: { type: 'string', description: 'Storage size (e.g., "10Gi")', default: '10Gi' },
                storageClass: { type: 'string', description: 'Storage class name (optional)' }
              },
              required: ['newClusterName', 'namespace', 'backupName']
            }
          },
          {
            name: 'get_backup_details',
            description: 'Get detailed information about a specific backup',
            inputSchema: {
              type: 'object',
              properties: {
                backupName: { type: 'string', description: 'Name of the backup' },
                namespace: { type: 'string', description: 'Namespace of the backup' }
              },
              required: ['backupName', 'namespace']
            }
          },
          {
            name: 'delete_backup',
            description: 'Delete a backup to free up storage space',
            inputSchema: {
              type: 'object',
              properties: {
                backupName: { type: 'string', description: 'Name of the backup to delete' },
                namespace: { type: 'string', description: 'Namespace of the backup' }
              },
              required: ['backupName', 'namespace']
            }
          },
          {
            name: 'get_cluster_events',
            description: 'Get Kubernetes events related to a cluster for troubleshooting',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' }
              },
              required: ['clusterName', 'namespace']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (!args) {
          throw new Error('Missing arguments');
        }

        switch (name) {
          case 'list_clusters':
            return await this.listClusters((args as any).namespace);
          
          case 'get_cluster':
            return await this.getCluster((args as any).name, (args as any).namespace);
          
          case 'create_cluster':
            return await this.createCluster(args as unknown as ClusterArgs);
          
          case 'delete_cluster':
            return await this.deleteCluster((args as any).name, (args as any).namespace);
          
          case 'scale_cluster':
            return await this.scaleCluster((args as any).name, (args as any).namespace, (args as any).instances);
          
          case 'create_backup':
            return await this.createBackup(args as unknown as BackupArgs);
          
          case 'list_backups':
            return await this.listBackups((args as any).namespace, (args as any).clusterName);
          
          case 'get_cluster_status':
            return await this.getClusterStatus((args as any).name, (args as any).namespace);
          
          case 'get_cluster_pods':
            return await this.getClusterPods((args as any).name, (args as any).namespace);
          
          case 'restore_cluster':
            return await this.restoreCluster(args as unknown as RestoreArgs);
          
          case 'get_backup_details':
            return await this.getBackupDetails((args as any).backupName, (args as any).namespace);
          
          case 'delete_backup':
            return await this.deleteBackup((args as any).backupName, (args as any).namespace);
          
          case 'get_cluster_events':
            return await this.getClusterEvents((args as any).clusterName, (args as any).namespace);
          
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
        response = await this.customApi.listNamespacedCustomObject({
          group: CNPG_GROUP,
          version: CNPG_VERSION,
          namespace: namespace,
          plural: CLUSTER_PLURAL
        });
      } else {
        response = await this.customApi.listClusterCustomObject({
          group: CNPG_GROUP,
          version: CNPG_VERSION,
          plural: CLUSTER_PLURAL
        });
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

      const clusterSummary = clusters.map((cluster: any) => ({
        name: cluster.metadata?.name || 'unknown',
        namespace: cluster.metadata?.namespace || 'unknown',
        instances: cluster.spec?.instances || 0,
        postgresVersion: cluster.spec?.postgresql?.parameters?.["postgres-version"] ||
                        cluster.spec?.imageName ||
                        'unknown',
        status: cluster.status?.phase || "Unknown",
        readyInstances: cluster.status?.readyInstances || 0,
        primary: cluster.status?.currentPrimary || 'unknown'
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${clusters.length} PostgreSQL clusters:\n\n${JSON.stringify(clusterSummary, null, 2)}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list clusters: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getCluster(name: string, namespace: string) {
    try {
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: name
      });

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

  private async createCluster(args: ClusterArgs) {
    const {
      name,
      namespace,
      instances = 3,
      storageSize = "10Gi",
      postgresVersion = "15",
      storageClass,
    } = args;

    const clusterSpec = {
      apiVersion: `${CNPG_GROUP}/${CNPG_VERSION}`,
      kind: "Cluster",
      metadata: {
        name,
        namespace,
      },
      spec: {
        instances,
        postgresql: {
          parameters: {
            max_connections: "100",
            shared_buffers: "256MB",
            effective_cache_size: "1GB",
          },
        },
        bootstrap: {
          initdb: {
            database: "app",
            owner: "app",
            secret: {
              name: `${name}-app-user`,
            },
          },
        },
        storage: {
          size: storageSize,
          ...(storageClass && { storageClass }),
        },
        monitoring: {
          enabled: true,
        },
      },
    };

    try {
      await this.customApi.createNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        body: clusterSpec
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully created PostgreSQL cluster '${name}' in namespace '${namespace}' with ${instances} instances.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to create cluster: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async deleteCluster(name: string, namespace: string) {
    try {
      await this.customApi.deleteNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: name
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully deleted PostgreSQL cluster '${name}' from namespace '${namespace}'.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to delete cluster: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async scaleCluster(name: string, namespace: string, instances: number) {
    try {
      // Get current cluster
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: name
      });

      const cluster = response.body as any;
      cluster.spec.instances = instances;

      // Update the cluster
      await this.customApi.replaceNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: name,
        body: cluster
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully scaled cluster '${name}' to ${instances} instances.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to scale cluster: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createBackup(args: BackupArgs) {
    const { clusterName, namespace, backupName } = args;
    const name = backupName || `${clusterName}-backup-${Date.now()}`;

    const backupSpec = {
      apiVersion: `${CNPG_GROUP}/${CNPG_VERSION}`,
      kind: "Backup",
      metadata: {
        name,
        namespace,
      },
      spec: {
        cluster: {
          name: clusterName,
        },
      },
    };

    try {
      await this.customApi.createNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: BACKUP_PLURAL,
        body: backupSpec
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully created backup '${name}' for cluster '${clusterName}'.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to create backup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async listBackups(namespace: string, clusterName?: string) {
    try {
      const response = await this.customApi.listNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: BACKUP_PLURAL
      });

      let backups = (response.body as any)?.items || [];

      if (clusterName) {
        backups = backups.filter((backup: any) =>
          backup.spec?.cluster?.name === clusterName
        );
      }

      const backupSummary = backups.map((backup: any) => ({
        name: backup.metadata?.name || 'unknown',
        cluster: backup.spec?.cluster?.name || 'unknown',
        status: backup.status?.phase || "Unknown",
        startedAt: backup.status?.startedAt || 'unknown',
        completedAt: backup.status?.completedAt || 'unknown',
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${backups.length} backups:\n\n${JSON.stringify(backupSummary, null, 2)}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list backups: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getClusterStatus(name: string, namespace: string) {
    try {
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: name
      });

      const cluster = response.body as any;
      const status = cluster.status || {};

      const statusInfo = {
        phase: status.phase || "Unknown",
        instances: cluster.spec?.instances || 0,
        readyInstances: status.readyInstances || 0,
        currentPrimary: status.currentPrimary || 'unknown',
        targetPrimary: status.targetPrimary || 'unknown',
        instancesStatus: status.instancesStatus || [],
        conditions: status.conditions || [],
      };

      return {
        content: [
          {
            type: 'text',
            text: `Cluster Status for '${name}':\n\n${JSON.stringify(statusInfo, null, 2)}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get cluster status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getClusterPods(name: string, namespace: string) {
    try {
      const labelSelector = `cnpg.io/cluster=${name}`;
      const response = await this.k8sApi.listNamespacedPod({
        namespace: namespace,
        labelSelector: labelSelector
      });

      const pods = (response as any).body.items.map((pod: any) => ({
        name: pod.metadata?.name || 'unknown',
        status: pod.status?.phase || 'unknown',
        ready: pod.status?.containerStatuses?.every((cs: any) => cs.ready) || false,
        restarts: pod.status?.containerStatuses?.[0]?.restartCount || 0,
        node: pod.spec?.nodeName || 'unknown',
        ip: pod.status?.podIP || 'unknown',
        role: pod.metadata?.labels?.["cnpg.io/instanceRole"] || 'unknown',
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Pods for cluster '${name}':\n\n${JSON.stringify(pods, null, 2)}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get cluster pods: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async restoreCluster(args: RestoreArgs) {
    const {
      newClusterName,
      namespace,
      backupName,
      instances = 3,
      storageSize = "10Gi",
      storageClass,
    } = args;

    // First, verify the backup exists
    try {
      await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: BACKUP_PLURAL,
        name: backupName
      });
    } catch (error) {
      throw new Error(`Backup '${backupName}' not found in namespace '${namespace}': ${error instanceof Error ? error.message : String(error)}`);
    }

    const clusterSpec = {
      apiVersion: `${CNPG_GROUP}/${CNPG_VERSION}`,
      kind: "Cluster",
      metadata: {
        name: newClusterName,
        namespace,
      },
      spec: {
        instances,
        postgresql: {
          parameters: {
            max_connections: "100",
            shared_buffers: "256MB",
            effective_cache_size: "1GB",
          },
        },
        bootstrap: {
          recovery: {
            backup: {
              name: backupName,
            },
          },
        },
        storage: {
          size: storageSize,
          ...(storageClass && { storageClass }),
        },
        monitoring: {
          enabled: true,
        },
      },
    };

    try {
      await this.customApi.createNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        body: clusterSpec
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully created cluster '${newClusterName}' from backup '${backupName}' in namespace '${namespace}' with ${instances} instances.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to restore cluster: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getBackupDetails(backupName: string, namespace: string) {
    try {
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: BACKUP_PLURAL,
        name: backupName
      });

      const backup = response.body as any;
      
      return {
        content: [
          {
            type: 'text',
            text: `## Backup Details: ${backupName}\n\n\`\`\`json\n${JSON.stringify(backup, null, 2)}\n\`\`\``
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get backup details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async deleteBackup(backupName: string, namespace: string) {
    try {
      await this.customApi.deleteNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: BACKUP_PLURAL,
        name: backupName
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully deleted backup '${backupName}' from namespace '${namespace}'.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to delete backup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getClusterEvents(clusterName: string, namespace: string) {
    try {
      const fieldSelector = `involvedObject.name=${clusterName}`;
      const response = await this.k8sApi.listNamespacedEvent({
        namespace: namespace,
        fieldSelector: fieldSelector
      });

      const events = (response as any).body.items.map((event: any) => ({
        type: event.type || 'Unknown',
        reason: event.reason || 'Unknown',
        message: event.message || 'No message',
        firstTime: event.firstTimestamp || 'Unknown',
        lastTime: event.lastTimestamp || 'Unknown',
        count: event.count || 1,
        source: event.source?.component || 'Unknown',
        object: {
          kind: event.involvedObject?.kind || 'Unknown',
          name: event.involvedObject?.name || 'Unknown'
        }
      }));

      // Sort events by last seen time (most recent first)
      events.sort((a: any, b: any) => {
        const timeA = new Date(a.lastTime).getTime();
        const timeB = new Date(b.lastTime).getTime();
        return timeB - timeA;
      });

      return {
        content: [
          {
            type: 'text',
            text: `Events for cluster '${clusterName}' (${events.length} events):\n\n${JSON.stringify(events, null, 2)}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get cluster events: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('CloudNativePG MCP server running on stdio');
  }
}

// Lancer le serveur
const server = new CNPGMCPServer();
server.run().catch(console.error);