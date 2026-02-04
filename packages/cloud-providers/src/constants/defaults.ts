/**
 * Default values for cloud provider configurations.
 */

// Container/Image defaults
export const DEFAULT_OPENCLAW_IMAGE = "openclaw:local";
export const DEFAULT_CONTAINER_MEMORY = "512";
export const DEFAULT_CONTAINER_CPU = "256";

// GCE defaults
export const GCE_DEFAULT_MACHINE_TYPE = "e2-small";
export const GCE_DEFAULT_DISK_SIZE_GB = 20;
export const GCE_DEFAULT_DISK_TYPE = "pd-standard";
export const GCE_DEFAULT_IMAGE_FAMILY = "ubuntu-2204-lts";
export const GCE_DEFAULT_IMAGE_PROJECT = "ubuntu-os-cloud";

// Azure defaults
export const AZURE_DEFAULT_VM_SIZE = "Standard_B2s";
export const AZURE_DEFAULT_OS_DISK_SIZE_GB = 30;
export const AZURE_DEFAULT_IMAGE_PUBLISHER = "Canonical";
export const AZURE_DEFAULT_IMAGE_OFFER = "0001-com-ubuntu-server-jammy";
export const AZURE_DEFAULT_IMAGE_SKU = "22_04-lts-gen2";

// ECS defaults
export const ECS_DEFAULT_CPU = "256";
export const ECS_DEFAULT_MEMORY = "512";
export const ECS_DEFAULT_DESIRED_COUNT = 1;

// Kubernetes defaults
export const K8S_DEFAULT_REPLICAS = 1;
export const K8S_DEFAULT_CPU_REQUEST = "100m";
export const K8S_DEFAULT_MEMORY_REQUEST = "256Mi";
export const K8S_DEFAULT_CPU_LIMIT = "500m";
export const K8S_DEFAULT_MEMORY_LIMIT = "512Mi";

// Network defaults
export const DEFAULT_GATEWAY_PORT = 18789;
export const DEFAULT_CONTROL_UI_PORT = 18790;
