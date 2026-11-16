/**
 * The fixed preset scenarios. Scenario Studio lists them after the live Supply
 * Chain 360 presets, and the domain-wide Ask Cortex runs every one of them.
 */
export const STATIC_PRESETS = [
  { id: "hurricane-austin", label: "Hurricane — Austin Fab offline",
    kind: "weather", targets: ["PLT-2000"], severity: 1, durationDays: 60,
    blurb: "The headline case: two customers lose supply directly and Penang is " +
           "starved of test fixtures, pulling Die Sorting down with it." },
  { id: "typhoon-penang", label: "Typhoon — Penang Assembly offline",
    kind: "weather", targets: ["PLT-5000"], severity: 1, durationDays: 30,
    blurb: "Penang is single-source for Die Sorting, so nothing here can be rerouted." },
  { id: "supplier-hamamatsu", label: "Supplier failure — Hamamatsu Photonics",
    kind: "supplier", targets: ["SUP-001"], severity: 1, durationDays: 45,
    blurb: "One supplier feeding two plants at once, which is why the ripple is wide " +
           "but shallow." },
  { id: "capacity-dresden", label: "Partial loss — Dresden Fab at 60%",
    kind: "capacity", targets: ["PLT-3000"], severity: 0.4, durationDays: 30,
    blurb: "Dresden has the least headroom in the network and is sole source for " +
           "E-Beam Review." },
  { id: "lane-sj-penang", label: "Lane closed — San Jose to Penang",
    kind: "lane", targets: ["FL-025"], severity: 1, durationDays: 40,
    blurb: "Both plants keep running; only the lane stops. Penang still loses a third " +
           "of its inbound volume." },
  { id: "demand-tsmc", label: "Demand spike — TSMC +60%",
    kind: "demand", targets: ["CUS-001"], severity: 0.6, durationDays: 30,
    blurb: "Tests headroom in the other direction: two plants go over 100%." },
];
