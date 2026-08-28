export interface Partner {
  id: string;
  name: string;
  initials: string;
  verified: boolean;
  rating: number;
  completed_deliveries: number;
  capacity_packages: number;
  distance_from_center_km: number;
  per_package_fee_usd: number;
}

export interface Cluster {
  id: string;
  name: string;
  package_count: number;
  total_weight_kg: number;
  delivery_window: string;
  direct_cost_usd: number;
  direct_distance_km: number;
  direct_driver_hours: number;
  co2_kg_per_km: number;
  partners: Partner[];
}

// Concept Demonstration Data
export const mockClusters: Cluster[] = [
  {
    id: "CL-001",
    name: "Anna Nagar, Chennai",
    package_count: 20,
    total_weight_kg: 85,
    delivery_window: "Today, 2PM - 6PM",
    direct_cost_usd: 45.00,
    direct_distance_km: 32.5,
    direct_driver_hours: 2.5,
    co2_kg_per_km: 0.15,
    partners: [
      {
        id: "P-101",
        name: "Arun Kumar Local Hub",
        initials: "AK",
        verified: true,
        rating: 4.9,
        completed_deliveries: 1240,
        capacity_packages: 25, // Can take the whole cluster
        distance_from_center_km: 1.2,
        per_package_fee_usd: 0.50
      },
      {
        id: "P-102",
        name: "Meena Stores",
        initials: "MS",
        verified: true,
        rating: 4.7,
        completed_deliveries: 89,
        capacity_packages: 12, // Partial capacity
        distance_from_center_km: 0.8,
        per_package_fee_usd: 0.65
      }
    ]
  },
  {
    id: "CL-002",
    name: "T Nagar Commercial",
    package_count: 35,
    total_weight_kg: 140,
    delivery_window: "Tomorrow, 9AM - 1PM",
    direct_cost_usd: 72.00,
    direct_distance_km: 48.0,
    direct_driver_hours: 4.0,
    co2_kg_per_km: 0.15,
    partners: [
      {
        id: "P-201",
        name: "Balaji Logistics",
        initials: "BL",
        verified: true,
        rating: 4.8,
        completed_deliveries: 5600,
        capacity_packages: 50,
        distance_from_center_km: 2.5,
        per_package_fee_usd: 0.40
      }
    ]
  },
  {
    id: "CL-003",
    name: "Velachery Residential",
    package_count: 15,
    total_weight_kg: 42,
    delivery_window: "Today, 5PM - 8PM",
    direct_cost_usd: 35.00,
    direct_distance_km: 22.0,
    direct_driver_hours: 1.8,
    co2_kg_per_km: 0.15,
    partners: [
      {
        id: "P-301",
        name: "Suresh Drop Point",
        initials: "SD",
        verified: true,
        rating: 4.5,
        completed_deliveries: 412,
        capacity_packages: 10, // Partial capacity
        distance_from_center_km: 1.5,
        per_package_fee_usd: 0.55
      }
    ]
  }
];
