/**
 * Community Delivery Consolidation - CONCEPT MODULE, FRONTEND ONLY.
 *
 * Representative data, not live operational data. In production, clusters would
 * come from the routing system, partners from a verification service, and
 * settlement from finance.
 *
 * The idea: sending a driver into a residential town to make 20 separate stops
 * is slow and expensive. Dropping all 20 with one verified local partner who
 * completes the last leg replaces twenty stops with one.
 */

export interface Partner {
  id: string;
  name: string;
  verified: boolean;
  rating: number;
  completedDeliveries: number;
  /** How many packages they can physically hold. */
  capacity: number;
  distanceKm: number;
  /** What we pay them, per package. */
  feePerPackage: number;
}

export interface Cluster {
  id: string;
  town: string;
  city: string;
  packages: number;
  totalWeightKg: number;
  window: string;
  /** Door-to-door cost per package when a driver makes every stop. */
  directCostPerPackage: number;
  /** Kilometres the van saves by making one stop instead of many. */
  kmSavedIfConsolidated: number;
  /** Driver hours saved. */
  hoursSavedIfConsolidated: number;
  partners: Partner[];
}

/** Grams of CO2 per km for a delivery van, used for the emissions estimate. */
export const CO2_PER_KM_G = 250;

export const CLUSTERS: Cluster[] = [
  {
    id: "anna-nagar",
    town: "Anna Nagar",
    city: "Chennai",
    packages: 20,
    totalWeightKg: 96,
    window: "Today, 09:00 - 18:00",
    directCostPerPackage: 0.47,
    kmSavedIfConsolidated: 14.2,
    hoursSavedIfConsolidated: 2.4,
    partners: [
      { id: "p1", name: "Lakshmi Stores", verified: true, rating: 4.8,
        completedDeliveries: 412, capacity: 25, distanceKm: 0.6, feePerPackage: 0.23 },
      { id: "p2", name: "Ravi Kumar", verified: true, rating: 4.6,
        completedDeliveries: 198, capacity: 18, distanceKm: 1.1, feePerPackage: 0.21 },
      { id: "p3", name: "Green Mart", verified: false, rating: 4.1,
        completedDeliveries: 47, capacity: 30, distanceKm: 1.8, feePerPackage: 0.18 },
    ],
  },
  {
    id: "adyar",
    town: "Adyar",
    city: "Chennai",
    packages: 34,
    totalWeightKg: 171,
    window: "Today, 10:00 - 19:00",
    directCostPerPackage: 0.58,
    kmSavedIfConsolidated: 21.7,
    hoursSavedIfConsolidated: 3.6,
    partners: [
      { id: "p4", name: "Adyar Book House", verified: true, rating: 4.9,
        completedDeliveries: 673, capacity: 40, distanceKm: 0.4, feePerPackage: 0.27 },
      { id: "p5", name: "Priya Traders", verified: true, rating: 4.4,
        completedDeliveries: 121, capacity: 20, distanceKm: 1.4, feePerPackage: 0.21 },
    ],
  },
  {
    id: "velachery",
    town: "Velachery",
    city: "Chennai",
    packages: 27,
    totalWeightKg: 133,
    window: "Tomorrow, 09:00 - 17:00",
    directCostPerPackage: 0.51,
    kmSavedIfConsolidated: 18.3,
    hoursSavedIfConsolidated: 3.1,
    partners: [
      { id: "p6", name: "Velachery Mini Mart", verified: true, rating: 4.7,
        completedDeliveries: 355, capacity: 22, distanceKm: 0.9, feePerPackage: 0.235 },
      { id: "p7", name: "Suresh Electronics", verified: true, rating: 4.3,
        completedDeliveries: 89, capacity: 12, distanceKm: 2.2, feePerPackage: 0.175 },
    ],
  },
  {
    id: "besant-nagar",
    town: "Besant Nagar",
    city: "Chennai",
    packages: 15,
    totalWeightKg: 68,
    window: "Tomorrow, 11:00 - 18:00",
    directCostPerPackage: 0.46,
    kmSavedIfConsolidated: 10.6,
    hoursSavedIfConsolidated: 1.8,
    partners: [
      { id: "p8", name: "Beach Road Pharmacy", verified: true, rating: 4.5,
        completedDeliveries: 264, capacity: 16, distanceKm: 0.7, feePerPackage: 0.23 },
    ],
  },
];

export interface Assignment { clusterId: string; partnerId: string }

export interface ClusterEconomics {
  assignedPackages: number;
  remainingPackages: number;
  directCost: number;
  consolidatedCost: number;
  saving: number;
  savingPct: number;
  kmSaved: number;
  hoursSaved: number;
  co2SavedKg: number;
}

/**
 * Work out the real economics of assigning a cluster to a partner.
 *
 * Partners often cannot take the whole cluster. Anything over their capacity
 * still goes out door-to-door at full price, and the maths must reflect that
 * rather than pretending everything fits.
 */
export function economics(cluster: Cluster, partner: Partner | null): ClusterEconomics {
  const directCost = cluster.packages * cluster.directCostPerPackage;

  if (!partner) {
    return {
      assignedPackages: 0, remainingPackages: cluster.packages,
      directCost, consolidatedCost: directCost,
      saving: 0, savingPct: 0, kmSaved: 0, hoursSaved: 0, co2SavedKg: 0,
    };
  }

  const assigned = Math.min(cluster.packages, partner.capacity);
  const remaining = cluster.packages - assigned;
  const ratio = assigned / cluster.packages;

  // Consolidated packages cost the partner fee plus one single van drop;
  // anything left over is still full-price door-to-door.
  const singleDropCost = cluster.directCostPerPackage;
  const consolidatedCost =
    assigned * partner.feePerPackage + singleDropCost + remaining * cluster.directCostPerPackage;

  const saving = directCost - consolidatedCost;
  const kmSaved = cluster.kmSavedIfConsolidated * ratio;

  return {
    assignedPackages: assigned,
    remainingPackages: remaining,
    directCost,
    consolidatedCost,
    saving,
    savingPct: directCost > 0 ? saving / directCost : 0,
    kmSaved,
    hoursSaved: cluster.hoursSavedIfConsolidated * ratio,
    co2SavedKg: (kmSaved * CO2_PER_KM_G) / 1000,
  };
}
