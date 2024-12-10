import {GraphNodeShape, type GraphPanelConfig} from '@unovis/ts'
import {
  storagemodelsv2ComponentStatus,
  type v2Endpoint,
  type v2EndpointHostConfig,
  v2EndpointHostVariant,
  v2EndpointVariant
} from "~/composables/aruna_api_json";

enum Status {
  Aruna = 'aruna',
  Healthy = 'healthy',
  Warning = 'warning',
  Inactive = 'inactive',
  Alert = 'alert'
}

export const StatusMap = {
  [Status.Aruna]: { color: '#005299', text: '&#xf00c;' },
  [Status.Healthy]: { color: '#47e845', text: '&#xf00c;' },
  [Status.Warning]: { color: '#ffc226', text: '&#xf071;' },
  [Status.Inactive]: { color: '#dddddd', text: '&#xf00d;' },
  [Status.Alert]: { color: '#f88080', text: '&#x21;' },
}

export type NodeDatum = {
  id: string;
  group: string;
  subgroup: string;
  label: string;
  site: string;
  shape: GraphNodeShape;
  fill?: string,
  clickable?: boolean,
  children?: NodeDatum[];
  icon?: string;
  score?: number;
  status?: string;
  groupLabel?: string;
  metaInfo?: v2Endpoint;
}

export type LinkDatum = {
  source: string;
  target: string;
  sourceGroup: string;
  targetGroup: string;
  status: Status;
  showTraffic: boolean;
}

type SiteConfig = {
  groupNodeId: string;
  panel: GraphPanelConfig;
}

export const nodes: NodeDatum[] = [
  {
    id: 'giessen-node',
    site: 'instance-gi',
    shape: GraphNodeShape.Circle,
    icon: '&#xf043;', //'&#xf0ac;',
    label: 'Gießen',
    group: 'instance-gi',
    subgroup: 'instance-gi',
    clickable: true,
    children: [
      {
        id: 'N:giessen-server,instance-gi',
        site: 'instance-gi',
        status: Status.Aruna,
        score: 87,
        icon: '&#xf233;', // '&#xf542;',
        shape: GraphNodeShape.Square,
        fill: '#007BC2',
        label: 'Aruna Server',
        group: 'instance-gi',
        subgroup: 'instance-gi-main',
        groupLabel: 'Gießen',
        clickable: true,
      },
      {
        id: 'N:giessen-storage-s3,instance-gi',
        site: 'instance-gi',
        status: Status.Healthy,
        score: 87,
        icon: '&#xe4cf;',
        shape: GraphNodeShape.Hexagon,
        label: 'S3 Proxy',
        group: 'instance-gi',
        subgroup: 'instance-gi-storage',
        groupLabel: 'Gießen',
        metaInfo: {
          id: '01JA5QVENNHZF9XZJ44QESBRS2',
          name: 'Gießen S3 Proxy',
          epVariant: v2EndpointVariant.ENDPOINT_VARIANT_PERSISTENT,
          status: storagemodelsv2ComponentStatus.COMPONENT_STATUS_AVAILABLE,
          isPublic: true,
          hostConfigs: [
            {
              url: 'https://data.gi.dev.aruna-storage.org',
              isPrimary: true,
              ssl: true,
              public: true,
              hostVariant: v2EndpointHostVariant.ENDPOINT_HOST_VARIANT_S3
            } as v2EndpointHostConfig
          ]
        } as v2Endpoint
      },
      {
        id: 'N:giessen-storage-file,instance-gi',
        site: 'instance-gi',
        status: Status.Healthy,
        score: 87,
        icon: '&#xf802;',
        shape: GraphNodeShape.Hexagon,
        label: 'Ceph FS Proxy',
        group: 'instance-gi',
        subgroup: 'instance-gi-storage',
        groupLabel: 'Gießen',
        metaInfo: {
          id: '01JA7ESTTVX4W7WEY8SYQ72JB3',
          name: 'Gießen Ceph FS Proxy',
          epVariant: v2EndpointVariant.ENDPOINT_VARIANT_PERSISTENT,
          status: storagemodelsv2ComponentStatus.COMPONENT_STATUS_UNAVAILABLE,
          isPublic: false
        }
      },
      {
        id: 'N:giessen-compute,instance-gi',
        site: 'instance-gi',
        status: Status.Healthy,
        score: 92,
        icon: '&#xe4e2;', //f233
        shape: GraphNodeShape.Hexagon,
        label: 'Slurm proxy',
        group: 'instance-gi',
        subgroup: 'instance-gi-compute',
        groupLabel: 'Gießen',
      },
    ],
  },
  {
    id: 'bielefeld-node',
    site: 'instance-bi',
    shape: GraphNodeShape.Circle,
    icon: '&#xf0ac;',
    label: 'Bielefeld',
    group: 'instance-bi',
    subgroup: 'instance-bi',
    clickable: true,
    children: [
      {
        id: 'N:bielefeld-server,instance-bi',
        site: 'instance-bi',
        status: Status.Warning,
        score: 87,
        icon: '&#xf542;',
        shape: GraphNodeShape.Square,
        fill: '#007BC2',
        label: 'Bielefeld Server',
        group: 'instance-bi',
        subgroup: 'instance-bi-main',
        groupLabel: 'Bielefeld',
        clickable: true,
      },
      {
        id: 'N:bielefeld-storage,instance-bi',
        site: 'instance-bi',
        status: Status.Healthy,
        score: 87,
        icon: '&#xf542;',
        shape: GraphNodeShape.Hexagon,
        label: 'Bielefeld Storage',
        group: 'instance-bi',
        subgroup: 'instance-bi-storage',
        groupLabel: 'Bielefeld',
      },
      {
        id: 'N:bielefeld-compute-clowm,instance-bi',
        site: 'instance-bi',
        status: Status.Healthy,
        score: 87,
        icon: '&#xf542;',
        shape: GraphNodeShape.Hexagon,
        label: 'Bielefeld CloWM',
        group: 'instance-bi',
        subgroup: 'instance-bi-compute',
        groupLabel: 'Bielefeld',
      },
      {
        id: 'N:bielefeld-compute-bibigrid,instance-bi',
        site: 'instance-bi',
        status: Status.Healthy,
        score: 87,
        icon: '&#xf542;',
        shape: GraphNodeShape.Hexagon,
        label: 'Bielefeld BiBi Grid',
        group: 'instance-bi',
        subgroup: 'instance-bi-compute',
        groupLabel: 'Bielefeld',
      },
    ],
  },
  {
    id: 'berlin-node',
    site: 'instance-be',
    shape: GraphNodeShape.Circle,
    icon: '&#xf0ac;',
    label: 'Berlin',
    group: 'instance-be',
    subgroup: 'instance-be',
    clickable: true,
    children: [
      {
        id: 'N:berlin-server,instance-be',
        site: 'instance-be',
        status: Status.Aruna,
        score: 87,
        icon: '&#xf542;',
        shape: GraphNodeShape.Square,
        fill: '#007BC2',
        label: 'Berlin Server',
        group: 'instance-be',
        subgroup: 'instance-be-main',
        groupLabel: 'Berlin',
        clickable: true,
      },
      {
        id: 'N:berlin-storage-s3,instance-be',
        site: 'instance-be',
        status: Status.Healthy,
        score: 87,
        icon: '&#xf542;',
        shape: GraphNodeShape.Hexagon,
        label: 'Berlin S3',
        group: 'instance-be',
        subgroup: 'instance-be-storage',
        groupLabel: 'Berlin',
      },
      {
        id: 'N:berlin-storage-file,instance-be',
        site: 'instance-be',
        status: Status.Healthy,
        score: 87,
        icon: '&#xf542;',
        shape: GraphNodeShape.Hexagon,
        label: 'Berlin File',
        group: 'instance-be',
        subgroup: 'instance-be-storage',
        groupLabel: 'Berlin',
      },
      {
        id: 'N:berlin-storage-mongodb,instance-be',
        site: 'instance-be',
        status: Status.Alert,
        score: 87,
        icon: '&#xf542;',
        shape: GraphNodeShape.Hexagon,
        label: 'Berlin Mongo DB',
        group: 'instance-be',
        subgroup: 'instance-be-storage',
        groupLabel: 'Berlin',
      },
    ],
  },
  {
    id: 'tuebingen-node',
    site: 'instance-tu',
    shape: GraphNodeShape.Circle,
    icon: '&#xf0ac;',
    label: 'Tübingen',
    group: 'instance-tu',
    subgroup: 'instance-tu',
    clickable: true,
    children: [
      {
        id: 'N:tuebingen-server,instance-tu',
        site: 'instance-tu',
        status: Status.Aruna,
        score: 87,
        icon: '&#xf542;',
        shape: GraphNodeShape.Square,
        fill: '#007BC2',
        label: 'Tübingen Server',
        group: 'instance-tu',
        subgroup: 'instance-tu-main',
        groupLabel: 'Tübingen',
        clickable: true,
      },
      {
        id: 'N:tuebingen-storage-s3,instance-tu',
        site: 'instance-tu',
        status: Status.Healthy,
        score: 87,
        icon: '&#xf542;',
        shape: GraphNodeShape.Hexagon,
        label: 'Tübingen S3',
        group: 'instance-tu',
        subgroup: 'instance-tu-storage',
        groupLabel: 'Tübingen',
      },
    ]
  }
]

export const links: LinkDatum[] = [
  {
    source: 'N:giessen-server,instance-gi',
    target: 'N:giessen-compute,instance-gi',
    status: Status.Inactive,
  },
  {
    source: 'N:giessen-server,instance-gi',
    target: 'N:giessen-storage-s3,instance-gi',
    status: Status.Inactive,
  },
  {
    source: 'N:giessen-server,instance-gi',
    target: 'N:giessen-storage-file,instance-gi',
    status: Status.Inactive,
  },
  {
    source: 'N:giessen-server,instance-gi',
    target: 'N:bielefeld-server,instance-bi',
    status: Status.Warning,
  },

  {
    source: 'N:bielefeld-server,instance-bi',
    target: 'N:bielefeld-compute-clowm,instance-bi',
    status: Status.Inactive,
  },
  {
    source: 'N:bielefeld-server,instance-bi',
    target: 'N:bielefeld-compute-bibigrid,instance-bi',
    status: Status.Inactive,
  },
  {
    source: 'N:bielefeld-server,instance-bi',
    target: 'N:bielefeld-storage,instance-bi',
    status: Status.Inactive,
  },
  {
    source: 'N:bielefeld-server,instance-bi',
    target: 'N:berlin-server,instance-be',
    status: Status.Warning,
  },

  {
    source: 'N:berlin-server,instance-be',
    target: 'N:berlin-storage-file,instance-be',
    status: Status.Inactive,
  },
  {
    source: 'N:berlin-server,instance-be',
    target: 'N:berlin-storage-s3,instance-be',
    status: Status.Inactive,
  },
  {
    source: 'N:berlin-server,instance-be',
    target: 'N:berlin-storage-mongodb,instance-be',
    status: Status.Alert,
  },
  {
    source: 'N:berlin-server,instance-be',
    target: 'N:tuebingen-server,instance-tu',
    status: Status.Healthy,
  },

  {
    source: 'N:tuebingen-server,instance-tu',
    target: 'N:tuebingen-storage-s3,instance-tu',
    status: Status.Inactive,
  },
  {
    source: 'N:tuebingen-server,instance-tu',
    target: 'N:giessen-server,instance-gi',
    status: Status.Healthy,
  },
].map(l => ({
  ...l,
  showTraffic: (l.status !== Status.Alert) && (l.status !== Status.Inactive),
  sourceGroup: nodes.find(n => n.children.map(c => c.id).includes(l.source))?.site,
  targetGroup: nodes.find(n => n.children.map(c => c.id).includes(l.target))?.site,
}))

export const sites: Record<string, SiteConfig> = nodes.reduce((acc, curr) => ({
  ...acc,
  [curr.site]: {
    groupNodeId: curr.id,
    panel: {
      nodes: curr.children.map(d => d.id),
      label: curr.label,
      borderWidth: 4,
      padding: 25,
      dashedOutline: true, //curr === nodes[0],
      sideIconFontSize: '20px',
      sideIconShape: GraphNodeShape.Circle,
      sideIconSymbol: curr.icon,
      sideIconShapeSize: 40,
    } as GraphPanelConfig,
  },
}), {})