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

interface ScheduledBackupArgs {
  name: string;
  namespace: string;
  clusterName: string;
  schedule: string;
  backupRetentionPolicy?: string;
  suspend?: boolean;
}

interface SwitchoverArgs {
  clusterName: string;
  namespace: string;
  targetPrimary?: string;
}

interface ClusterLogsArgs {
  clusterName: string;
  namespace: string;
  podName?: string;
  container?: string;
  tailLines?: number;
}

interface PatchConfigArgs {
  clusterName: string;
  namespace: string;
  postgresqlConfig?: Record<string, string>;
  resources?: any;
}

interface ReplicaClusterArgs {
  clusterName: string;
  namespace: string;
  primaryCluster: string;
  source: string;
  instances?: number;
  storageSize?: string;
  storageClass?: string;
}

interface PoolerArgs {
  poolerName: string;
  namespace: string;
  clusterName: string;
  instances?: number;
  type?: string;
  poolMode?: string;
  pgbouncerConfig?: any;
  maxClientConn?: number;
  defaultPoolSize?: number;
}

interface UpgradeArgs {
  clusterName: string;
  namespace: string;
  postgresVersion: string;
  strategy?: string;
  imageName?: string;
}

interface LogicalReplicaArgs {
  clusterName: string;
  namespace: string;
  sourceCluster: string;
  instances?: number;
  storageSize?: string;
  publicationName?: string;
  publications?: string[];
  subscriptions?: string[];
}

interface TablespaceArgs {
  clusterName: string;
  namespace: string;
  tablespaceName: string;
  storageClass?: string;
  size?: string;
}

interface DatabaseArgs {
  clusterName: string;
  namespace: string;
  databaseName: string;
  owner?: string;
  encoding?: string;
  template?: string;
}

interface SyncReplicationArgs {
  clusterName: string;
  namespace: string;
  enabled: boolean;
  syncStandbyNames?: string[];
  synchronousStandbyNames?: string;
  syncReplicas?: number;
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
          },
          {
            name: 'create_scheduled_backup',
            description: 'Create a scheduled backup configuration for a PostgreSQL cluster',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name for the scheduled backup' },
                namespace: { type: 'string', description: 'Namespace of the cluster' },
                clusterName: { type: 'string', description: 'Name of the cluster to backup' },
                schedule: { type: 'string', description: 'Cron schedule (e.g., "0 2 * * *" for daily at 2am)' },
                backupRetentionPolicy: { type: 'string', description: 'Retention policy (e.g., "7d")' },
                suspend: { type: 'boolean', description: 'Whether to suspend the schedule', default: false }
              },
              required: ['name', 'namespace', 'clusterName', 'schedule']
            }
          },
          {
            name: 'list_scheduled_backups',
            description: 'List scheduled backup configurations',
            inputSchema: {
              type: 'object',
              properties: {
                namespace: { type: 'string', description: 'Namespace to list scheduled backups from' },
                clusterName: { type: 'string', description: 'Filter by cluster name (optional)' }
              },
              required: ['namespace']
            }
          },
          {
            name: 'get_cluster_logs',
            description: 'Get logs from PostgreSQL cluster pods',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' },
                podName: { type: 'string', description: 'Specific pod name (optional)' },
                container: { type: 'string', description: 'Container name (default: postgres)' },
                tailLines: { type: 'number', description: 'Number of lines to tail (default: 100)', default: 100 }
              },
              required: ['clusterName', 'namespace']
            }
          },
          {
            name: 'switchover_primary',
            description: 'Perform a manual switchover to promote a replica as new primary',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' },
                targetPrimary: { type: 'string', description: 'Target pod name to promote (optional, auto-selected if not provided)' }
              },
              required: ['clusterName', 'namespace']
            }
          },
          {
            name: 'get_cluster_metrics',
            description: 'Get Prometheus metrics for a PostgreSQL cluster',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' }
              },
              required: ['clusterName', 'namespace']
            }
          },
          {
            name: 'pause_cluster',
            description: 'Pause (hibernate) a PostgreSQL cluster to save resources',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' }
              },
              required: ['clusterName', 'namespace']
            }
          },
          {
            name: 'resume_cluster',
            description: 'Resume a paused PostgreSQL cluster',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' }
              },
              required: ['clusterName', 'namespace']
            }
          },
          {
            name: 'patch_cluster_config',
            description: 'Update PostgreSQL configuration parameters',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' },
                parameters: { type: 'object', description: 'PostgreSQL parameters to update (key-value pairs)' }
              },
              required: ['clusterName', 'namespace', 'parameters']
            }
          },
          {
            name: 'create_replica_cluster',
            description: 'Create a replica cluster for cross-region replication',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name for the replica cluster' },
                namespace: { type: 'string', description: 'Namespace to create replica in' },
                sourceClusterName: { type: 'string', description: 'Source cluster name' },
                sourceNamespace: { type: 'string', description: 'Source cluster namespace (optional)' },
                instances: { type: 'number', description: 'Number of instances (default: 1)', default: 1 },
                storageSize: { type: 'string', description: 'Storage size (default: "10Gi")', default: '10Gi' },
                storageClass: { type: 'string', description: 'Storage class (optional)' }
              },
              required: ['name', 'namespace', 'sourceClusterName']
            }
          },
          {
            name: 'get_cluster_certificates',
            description: 'Get TLS certificates and CA information for a cluster',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' }
              },
              required: ['clusterName', 'namespace']
            }
          },
          {
            name: 'create_pooler',
            description: 'Create a PgBouncer connection pooler for a cluster',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name for the pooler' },
                namespace: { type: 'string', description: 'Namespace of the cluster' },
                clusterName: { type: 'string', description: 'Target cluster name' },
                instances: { type: 'number', description: 'Number of pooler instances (default: 1)', default: 1 },
                poolMode: { type: 'string', description: 'Pool mode (session, transaction, statement)', default: 'session' },
                maxClientConn: { type: 'number', description: 'Max client connections (default: 100)', default: 100 },
                defaultPoolSize: { type: 'number', description: 'Default pool size (default: 20)', default: 20 }
              },
              required: ['name', 'namespace', 'clusterName']
            }
          },
          {
            name: 'upgrade_postgres_version',
            description: 'Perform a major PostgreSQL version upgrade',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' },
                postgresVersion: { type: 'string', description: 'Target PostgreSQL version (e.g., "16")' },
                imageName: { type: 'string', description: 'Custom image name (optional)' }
              },
              required: ['clusterName', 'namespace', 'postgresVersion']
            }
          },
          {
            name: 'get_backup_status',
            description: 'Get detailed status of backup operations',
            inputSchema: {
              type: 'object',
              properties: {
                namespace: { type: 'string', description: 'Namespace to check backups' },
                backupName: { type: 'string', description: 'Specific backup name (optional)' }
              },
              required: ['namespace']
            }
          },
          {
            name: 'create_logical_replica',
            description: 'Set up logical replication with publications and subscriptions',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name for the logical replica setup' },
                namespace: { type: 'string', description: 'Namespace' },
                sourceClusterName: { type: 'string', description: 'Source cluster for replication' },
                sourceNamespace: { type: 'string', description: 'Source namespace (optional)' },
                publications: { type: 'array', items: { type: 'string' }, description: 'Publication names to create' },
                subscriptions: { type: 'array', items: { type: 'string' }, description: 'Subscription names to create' }
              },
              required: ['name', 'namespace', 'sourceClusterName']
            }
          },
          {
            name: 'manage_tablespaces',
            description: 'Create and manage PostgreSQL tablespaces',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' },
                tablespaceName: { type: 'string', description: 'Name of the tablespace' },
                storageClass: { type: 'string', description: 'Storage class for tablespace' },
                size: { type: 'string', description: 'Size of tablespace storage (e.g., "50Gi")' }
              },
              required: ['clusterName', 'namespace', 'tablespaceName']
            }
          },
          {
            name: 'create_database_declarative',
            description: 'Declaratively create databases and users',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' },
                databaseName: { type: 'string', description: 'Name of the database to create' },
                owner: { type: 'string', description: 'Database owner username' },
                encoding: { type: 'string', description: 'Character encoding (default: UTF8)', default: 'UTF8' },
                template: { type: 'string', description: 'Template database (default: template1)', default: 'template1' }
              },
              required: ['clusterName', 'namespace', 'databaseName']
            }
          },
          {
            name: 'get_replication_status',
            description: 'Monitor replication lag and synchronization status',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' }
              },
              required: ['clusterName', 'namespace']
            }
          },
          {
            name: 'manage_extensions',
            description: 'Install and manage PostgreSQL extensions',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' },
                extensions: { type: 'array', items: { type: 'string' }, description: 'List of extensions to install' },
                action: { type: 'string', enum: ['install', 'remove', 'list'], description: 'Action to perform', default: 'install' }
              },
              required: ['clusterName', 'namespace', 'extensions']
            }
          },
          {
            name: 'set_synchronous_replication',
            description: 'Configure synchronous replication settings',
            inputSchema: {
              type: 'object',
              properties: {
                clusterName: { type: 'string', description: 'Name of the cluster' },
                namespace: { type: 'string', description: 'Namespace of the cluster' },
                synchronousStandbyNames: { type: 'string', description: 'Synchronous standby names pattern' },
                syncReplicas: { type: 'number', description: 'Number of synchronous replicas', default: 1 }
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
          
          case 'create_scheduled_backup':
            return await this.createScheduledBackup(args as unknown as ScheduledBackupArgs);
          
          case 'list_scheduled_backups':
            return await this.listScheduledBackups((args as any).namespace, (args as any).clusterName);
          
          case 'get_cluster_logs':
            return await this.getClusterLogs(args as unknown as ClusterLogsArgs);
          
          case 'switchover_primary':
            return await this.switchoverPrimary(args as unknown as SwitchoverArgs);
          
          case 'get_cluster_metrics':
            return await this.getClusterMetrics((args as any).clusterName, (args as any).namespace);
          
          case 'pause_cluster':
            return await this.pauseCluster((args as any).clusterName, (args as any).namespace);
          
          case 'resume_cluster':
            return await this.resumeCluster((args as any).clusterName, (args as any).namespace);
          
          case 'patch_cluster_config':
            return await this.patchClusterConfig(args as unknown as PatchConfigArgs);
          
          case 'create_replica_cluster':
            return await this.createReplicaCluster(args as unknown as ReplicaClusterArgs);
          
          case 'get_cluster_certificates':
            return await this.getClusterCertificates((args as any).clusterName, (args as any).namespace);
          
          case 'create_pooler':
            return await this.createPooler(args as unknown as PoolerArgs);
          
          case 'upgrade_postgres_version':
            return await this.upgradePostgresVersion(args as unknown as UpgradeArgs);
          
          case 'get_backup_status':
            return await this.getBackupStatus((args as any).namespace, (args as any).backupName);
          
          case 'create_logical_replica':
            return await this.createLogicalReplica(args as unknown as LogicalReplicaArgs);
          
          case 'manage_tablespaces':
            return await this.manageTablespaces(args as unknown as TablespaceArgs);
          
          case 'create_database_declarative':
            return await this.createDatabaseDeclarative(args as unknown as DatabaseArgs);
          
          case 'get_replication_status':
            return await this.getReplicationStatus((args as any).clusterName, (args as any).namespace);
          
          case 'manage_extensions':
            return await this.manageExtensions((args as any).clusterName, (args as any).namespace, (args as any).extensions);
          
          case 'set_synchronous_replication':
            return await this.setSynchronousReplication(args as unknown as SyncReplicationArgs);
          
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

      const clusters = (response.body as any)?.items || (response as any)?.body?.items || (response as any)?.items || [];
      
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

      const cluster = (response.body as any) || (response as any)?.body || (response as any);
      
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

      const cluster = (response.body as any) || (response as any)?.body || (response as any);
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

      let backups = (response.body as any)?.items || (response as any)?.body?.items || (response as any)?.items || [];

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

      const cluster = (response.body as any) || (response as any)?.body || (response as any);
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

      const items = (response as any)?.body?.items || (response as any)?.items || [];
      const pods = items.map((pod: any) => ({
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

      const backup = (response.body as any) || (response as any)?.body || (response as any);
      
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

      const items = (response as any)?.body?.items || (response as any)?.items || [];
      const events = items.map((event: any) => ({
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

  private async createScheduledBackup(args: ScheduledBackupArgs) {
    const {
      name,
      namespace,
      clusterName,
      schedule,
      backupRetentionPolicy = "30d",
      suspend = false,
    } = args;

    const scheduledBackupSpec = {
      apiVersion: `${CNPG_GROUP}/${CNPG_VERSION}`,
      kind: "ScheduledBackup",
      metadata: {
        name,
        namespace,
      },
      spec: {
        schedule,
        suspend,
        backupOwnerReference: "self",
        cluster: {
          name: clusterName,
        },
        ...(backupRetentionPolicy && {
          retentionPolicy: backupRetentionPolicy,
        }),
      },
    };

    try {
      await this.customApi.createNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: SCHEDULED_BACKUP_PLURAL,
        body: scheduledBackupSpec
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully created scheduled backup '${name}' for cluster '${clusterName}' with schedule '${schedule}'.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to create scheduled backup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async listScheduledBackups(namespace: string, clusterName?: string) {
    try {
      const response = await this.customApi.listNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: SCHEDULED_BACKUP_PLURAL
      });

      let scheduledBackups = (response.body as any)?.items || (response as any)?.body?.items || (response as any)?.items || [];

      if (clusterName) {
        scheduledBackups = scheduledBackups.filter((sb: any) =>
          sb.spec?.cluster?.name === clusterName
        );
      }

      const scheduledBackupSummary = scheduledBackups.map((sb: any) => ({
        name: sb.metadata?.name || 'unknown',
        cluster: sb.spec?.cluster?.name || 'unknown',
        schedule: sb.spec?.schedule || 'unknown',
        suspended: sb.spec?.suspend || false,
        retentionPolicy: sb.spec?.retentionPolicy || 'unknown',
        lastScheduledTime: sb.status?.lastScheduledTime || 'never',
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${scheduledBackups.length} scheduled backups:\n\n${JSON.stringify(scheduledBackupSummary, null, 2)}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list scheduled backups: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getClusterLogs(args: ClusterLogsArgs) {
    const { clusterName, namespace, podName, container = 'postgres', tailLines = 100 } = args;

    try {
      let targetPods: string[] = [];

      if (podName) {
        targetPods = [podName];
      } else {
        // Get all pods for the cluster
        const labelSelector = `cnpg.io/cluster=${clusterName}`;
        const podsResponse = await this.k8sApi.listNamespacedPod({
          namespace: namespace,
          labelSelector: labelSelector
        });
        const items = (podsResponse as any)?.body?.items || (podsResponse as any)?.items || [];
        targetPods = items.map((pod: any) => pod.metadata?.name || '').filter((name: any) => name);
      }

      if (targetPods.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No pods found for cluster '${clusterName}' in namespace '${namespace}'.`
            }
          ]
        };
      }

      const logs = await Promise.all(
        targetPods.map(async (pod) => {
          try {
            const logResponse = await this.k8sApi.readNamespacedPodLog({
              name: pod,
              namespace: namespace,
              container: container,
              tailLines: tailLines
            });
            return { pod, logs: (logResponse as any).body };
          } catch (error) {
            return { pod, logs: `Error fetching logs: ${error instanceof Error ? error.message : String(error)}` };
          }
        })
      );

      const formattedLogs = logs.map(({ pod, logs }) => `## Pod: ${pod}\n\n\`\`\`\n${logs}\n\`\`\``).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Logs for cluster '${clusterName}':\n\n${formattedLogs}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get cluster logs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async switchoverPrimary(args: SwitchoverArgs) {
    const { clusterName, namespace, targetPrimary } = args;

    try {
      // Get current cluster
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: clusterName
      });

      const cluster = (response.body as any) || (response as any)?.body || (response as any);
      const currentPrimary = cluster.status?.currentPrimary;

      // If targetPrimary is not specified, let CNPG choose automatically
      const switchoverSpec = targetPrimary 
        ? { switchoverTo: targetPrimary }
        : { switchoverTo: "any" };

      // Add switchover annotation
      if (!cluster.metadata.annotations) {
        cluster.metadata.annotations = {};
      }
      cluster.metadata.annotations["cnpg.io/switchover"] = JSON.stringify(switchoverSpec);

      // Update the cluster
      await this.customApi.replaceNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: clusterName,
        body: cluster
      });

      return {
        content: [
          {
            type: 'text',
            text: targetPrimary 
              ? `Switchover initiated for cluster '${clusterName}' from '${currentPrimary}' to '${targetPrimary}'.`
              : `Automatic switchover initiated for cluster '${clusterName}' from '${currentPrimary}'.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to perform switchover: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getClusterMetrics(clusterName: string, namespace: string) {
    try {
      // Get cluster pods to extract metrics
      const labelSelector = `cnpg.io/cluster=${clusterName}`;
      const podsResponse = await this.k8sApi.listNamespacedPod({
        namespace: namespace,
        labelSelector: labelSelector
      });

      const pods = (podsResponse as any)?.body?.items || (podsResponse as any)?.items || [];
      const metrics = {
        clusterName,
        namespace,
        totalPods: pods.length,
        readyPods: pods.filter((pod: any) => pod.status?.containerStatuses?.every((cs: any) => cs.ready)).length,
        pods: pods.map((pod: any) => ({
          name: pod.metadata?.name || 'unknown',
          status: pod.status?.phase || 'unknown',
          ready: pod.status?.containerStatuses?.every((cs: any) => cs.ready) || false,
          restarts: pod.status?.containerStatuses?.[0]?.restartCount || 0,
          cpuRequests: pod.spec?.containers?.[0]?.resources?.requests?.cpu || 'unknown',
          memoryRequests: pod.spec?.containers?.[0]?.resources?.requests?.memory || 'unknown',
          cpuLimits: pod.spec?.containers?.[0]?.resources?.limits?.cpu || 'unknown',
          memoryLimits: pod.spec?.containers?.[0]?.resources?.limits?.memory || 'unknown',
          role: pod.metadata?.labels?.["cnpg.io/instanceRole"] || 'unknown',
        })),
        metricsNote: "For detailed Prometheus metrics, ensure monitoring is enabled and query the metrics endpoint directly."
      };

      return {
        content: [
          {
            type: 'text',
            text: `Metrics for cluster '${clusterName}':\n\n${JSON.stringify(metrics, null, 2)}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get cluster metrics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async pauseCluster(clusterName: string, namespace: string) {
    try {
      // Get current cluster
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: clusterName
      });

      const cluster = (response.body as any) || (response as any)?.body || (response as any);
      
      // Add hibernation annotation
      if (!cluster.metadata.annotations) {
        cluster.metadata.annotations = {};
      }
      cluster.metadata.annotations["cnpg.io/hibernation"] = "on";

      // Update the cluster
      await this.customApi.replaceNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: clusterName,
        body: cluster
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully paused cluster '${clusterName}'. The cluster is now hibernating and pods will be removed while preserving data.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to pause cluster: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async resumeCluster(clusterName: string, namespace: string) {
    try {
      // Get current cluster
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: clusterName
      });

      const cluster = (response.body as any) || (response as any)?.body || (response as any);
      
      // Remove hibernation annotation
      if (cluster.metadata.annotations && cluster.metadata.annotations["cnpg.io/hibernation"]) {
        delete cluster.metadata.annotations["cnpg.io/hibernation"];
      }

      // Update the cluster
      await this.customApi.replaceNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: clusterName,
        body: cluster
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully resumed cluster '${clusterName}'. The cluster will restart and pods will be recreated.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to resume cluster: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async patchClusterConfig(args: PatchConfigArgs) {
    try {
      // Get current cluster
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: CLUSTER_PLURAL,
        name: args.clusterName
      });

      const cluster = (response.body as any) || (response as any)?.body || (response as any);
      
      // Apply configuration patch
      if (args.postgresqlConfig) {
        if (!cluster.spec.postgresql) {
          cluster.spec.postgresql = {};
        }
        if (!cluster.spec.postgresql.parameters) {
          cluster.spec.postgresql.parameters = {};
        }
        Object.assign(cluster.spec.postgresql.parameters, args.postgresqlConfig);
      }

      if (args.resources) {
        cluster.spec.resources = args.resources;
      }

      // Update the cluster
      await this.customApi.replaceNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: CLUSTER_PLURAL,
        name: args.clusterName,
        body: cluster
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully updated configuration for cluster '${args.clusterName}'. Changes will be applied gradually during rolling update.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to patch cluster configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createReplicaCluster(args: ReplicaClusterArgs) {
    try {
      const cluster = {
        apiVersion: `${CNPG_GROUP}/${CNPG_VERSION}`,
        kind: 'Cluster',
        metadata: {
          name: args.clusterName,
          namespace: args.namespace
        },
        spec: {
          instances: args.instances || 1,
          replica: {
            primary: args.primaryCluster,
            source: args.source
          },
          storage: {
            size: args.storageSize || '10Gi'
          }
        }
      };

      await this.customApi.createNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: CLUSTER_PLURAL,
        body: cluster
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully created replica cluster '${args.clusterName}' from primary '${args.primaryCluster}'.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to create replica cluster: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getClusterCertificates(clusterName: string, namespace: string) {
    try {
      // Get cluster certificates from secrets
      const secretsResponse = await this.k8sApi.listNamespacedSecret({
        namespace: namespace,
        labelSelector: `cnpg.io/cluster=${clusterName}`
      });

      const items = (secretsResponse as any)?.body?.items || (secretsResponse as any)?.items || [];
      const certificates = items
        .filter((secret: any) => secret.metadata?.name?.includes('cert'))
        .map((secret: any) => ({
          name: secret.metadata?.name,
          type: secret.type,
          creationTimestamp: secret.metadata?.creationTimestamp,
          labels: secret.metadata?.labels
        }));

      return {
        content: [
          {
            type: 'text',
            text: `Certificates for cluster '${clusterName}':\n\n${JSON.stringify(certificates, null, 2)}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get cluster certificates: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createPooler(args: PoolerArgs) {
    try {
      const pooler = {
        apiVersion: `${CNPG_GROUP}/${CNPG_VERSION}`,
        kind: 'Pooler',
        metadata: {
          name: args.poolerName,
          namespace: args.namespace
        },
        spec: {
          cluster: {
            name: args.clusterName
          },
          instances: args.instances || 1,
          type: args.type || 'rw',
          pgbouncer: {
            poolMode: args.poolMode || 'session',
            parameters: args.pgbouncerConfig || {}
          }
        }
      };

      await this.customApi.createNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: 'poolers',
        body: pooler
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully created pooler '${args.poolerName}' for cluster '${args.clusterName}'.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to create pooler: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async upgradePostgresVersion(args: UpgradeArgs) {
    try {
      // Get current cluster
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: CLUSTER_PLURAL,
        name: args.clusterName
      });

      const cluster = (response.body as any) || (response as any)?.body || (response as any);
      
      // Update PostgreSQL version
      cluster.spec.imageName = `postgres:${args.postgresVersion}`;
      
      // Add upgrade strategy if specified
      if (args.strategy) {
        if (!cluster.spec.postgresql) {
          cluster.spec.postgresql = {};
        }
        cluster.spec.postgresql.upgradeStrategy = args.strategy;
      }

      // Update the cluster
      await this.customApi.replaceNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: CLUSTER_PLURAL,
        name: args.clusterName,
        body: cluster
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully initiated PostgreSQL upgrade for cluster '${args.clusterName}' to version ${args.postgresVersion}.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to upgrade PostgreSQL version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getBackupStatus(backupName: string, namespace: string) {
    try {
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: BACKUP_PLURAL,
        name: backupName
      });

      const backup = (response.body as any) || (response as any)?.body || (response as any);
      const status = {
        name: backup.metadata.name,
        namespace: backup.metadata.namespace,
        cluster: backup.spec.cluster?.name,
        phase: backup.status?.phase,
        startedAt: backup.status?.startedAt,
        stoppedAt: backup.status?.stoppedAt,
        backupId: backup.status?.backupId,
        serverName: backup.status?.serverName,
        error: backup.status?.error
      };

      return {
        content: [
          {
            type: 'text',
            text: `Backup status for '${backupName}':\n\n${JSON.stringify(status, null, 2)}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get backup status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createLogicalReplica(args: LogicalReplicaArgs) {
    try {
      const cluster = {
        apiVersion: `${CNPG_GROUP}/${CNPG_VERSION}`,
        kind: 'Cluster',
        metadata: {
          name: args.clusterName,
          namespace: args.namespace
        },
        spec: {
          instances: args.instances || 1,
          replica: {
            enabled: true,
            primary: args.sourceCluster,
            source: 'streaming'
          },
          postgresql: {
            parameters: {
              'wal_level': 'logical',
              'max_replication_slots': '10',
              'max_wal_senders': '10'
            }
          },
          storage: {
            size: args.storageSize || '10Gi'
          }
        }
      };

      if (args.publicationName) {
        cluster.spec.replica.source = 'logical';
        (cluster.spec.replica as any).publicationName = args.publicationName;
      }

      await this.customApi.createNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: CLUSTER_PLURAL,
        body: cluster
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully created logical replica cluster '${args.clusterName}' from source '${args.sourceCluster}'.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to create logical replica: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async manageTablespaces(args: TablespaceArgs) {
    try {
      // Get current cluster
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: CLUSTER_PLURAL,
        name: args.clusterName
      });

      const cluster = (response.body as any) || (response as any)?.body || (response as any);
      
      // Add tablespace configuration
      if (!cluster.spec.tablespaces) {
        cluster.spec.tablespaces = [];
      }

      const tablespace = {
        name: args.tablespaceName,
        storage: {
          size: args.size,
          storageClass: args.storageClass
        }
      };

      cluster.spec.tablespaces.push(tablespace);

      // Update the cluster
      await this.customApi.replaceNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: CLUSTER_PLURAL,
        name: args.clusterName,
        body: cluster
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully added tablespace '${args.tablespaceName}' to cluster '${args.clusterName}'.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to manage tablespaces: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createDatabaseDeclarative(args: DatabaseArgs) {
    try {
      // Get current cluster
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: CLUSTER_PLURAL,
        name: args.clusterName
      });

      const cluster = (response.body as any) || (response as any)?.body || (response as any);
      
      // Add database configuration
      if (!cluster.spec.bootstrap) {
        cluster.spec.bootstrap = {};
      }
      if (!cluster.spec.bootstrap.initdb) {
        cluster.spec.bootstrap.initdb = {};
      }
      if (!cluster.spec.bootstrap.initdb.postInitApplicationSQL) {
        cluster.spec.bootstrap.initdb.postInitApplicationSQL = [];
      }

      // Add CREATE DATABASE SQL
      let createDbSql = `CREATE DATABASE "${args.databaseName}"`;
      if (args.owner) {
        createDbSql += ` OWNER "${args.owner}"`;
      }
      if (args.encoding) {
        createDbSql += ` ENCODING '${args.encoding}'`;
      }

      cluster.spec.bootstrap.initdb.postInitApplicationSQL.push(createDbSql);

      // Update the cluster
      await this.customApi.replaceNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: CLUSTER_PLURAL,
        name: args.clusterName,
        body: cluster
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully configured database '${args.databaseName}' creation for cluster '${args.clusterName}'.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to create database declaratively: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getReplicationStatus(clusterName: string, namespace: string) {
    try {
      // Get cluster pods
      const podsResponse = await this.k8sApi.listNamespacedPod({
        namespace: namespace,
        labelSelector: `cnpg.io/cluster=${clusterName}`
      });

      const replicationInfo = await Promise.all(
        ((podsResponse as any)?.body?.items || (podsResponse as any)?.items || []).map(async (pod: any) => {
          try {
            // Check if this is a replica pod
            const role = pod.metadata?.labels?.['cnpg.io/instanceRole'];
            const podName = pod.metadata?.name;
            
            return {
              podName: podName,
              role: role,
              status: pod.status?.phase,
              ready: pod.status?.containerStatuses?.[0]?.ready || false
            };
          } catch {
            return null;
          }
        })
      );

      const validReplicas = replicationInfo.filter((info: any) => info !== null);

      return {
        content: [
          {
            type: 'text',
            text: `Replication status for cluster '${clusterName}':\n\n${JSON.stringify(validReplicas, null, 2)}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get replication status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async manageExtensions(clusterName: string, namespace: string, extensions: string[]) {
    try {
      // Get current cluster
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: clusterName
      });

      const cluster = (response.body as any) || (response as any)?.body || (response as any);
      
      // Add extensions to bootstrap configuration
      if (!cluster.spec.bootstrap) {
        cluster.spec.bootstrap = {};
      }
      if (!cluster.spec.bootstrap.initdb) {
        cluster.spec.bootstrap.initdb = {};
      }
      if (!cluster.spec.bootstrap.initdb.postInitApplicationSQL) {
        cluster.spec.bootstrap.initdb.postInitApplicationSQL = [];
      }

      // Add CREATE EXTENSION SQL for each extension
      extensions.forEach(ext => {
        cluster.spec.bootstrap.initdb.postInitApplicationSQL.push(`CREATE EXTENSION IF NOT EXISTS ${ext};`);
      });

      // Update the cluster
      await this.customApi.replaceNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: namespace,
        plural: CLUSTER_PLURAL,
        name: clusterName,
        body: cluster
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully configured extensions ${extensions.join(', ')} for cluster '${clusterName}'.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to manage extensions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async setSynchronousReplication(args: SyncReplicationArgs) {
    try {
      // Get current cluster
      const response = await this.customApi.getNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: CLUSTER_PLURAL,
        name: args.clusterName
      });

      const cluster = (response.body as any) || (response as any)?.body || (response as any);
      
      // Configure synchronous replication
      if (!cluster.spec.postgresql) {
        cluster.spec.postgresql = {};
      }
      if (!cluster.spec.postgresql.parameters) {
        cluster.spec.postgresql.parameters = {};
      }

      cluster.spec.postgresql.parameters['synchronous_commit'] = args.enabled ? 'on' : 'off';
      
      if (args.enabled && args.syncStandbyNames) {
        cluster.spec.postgresql.parameters['synchronous_standby_names'] = args.syncStandbyNames.join(',');
      }

      // Update the cluster
      await this.customApi.replaceNamespacedCustomObject({
        group: CNPG_GROUP,
        version: CNPG_VERSION,
        namespace: args.namespace,
        plural: CLUSTER_PLURAL,
        name: args.clusterName,
        body: cluster
      });

      const status = args.enabled ? 'enabled' : 'disabled';
      return {
        content: [
          {
            type: 'text',
            text: `Successfully ${status} synchronous replication for cluster '${args.clusterName}'.`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to set synchronous replication: ${error instanceof Error ? error.message : String(error)}`);
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