export const RPDR_S18 = {
  seasonKey: "RPDR_S18",

  // Premiere: Jan 2, 2026 @ 8:00 PM ET
  // Stored as an ISO string with timezone offset (ET = -05:00 in January).
  premiereEtIso: "2026-01-02T20:00:00-05:00",

  queens: [
    { name: "Athena Dion" },
    { name: "Briar Blush" },
    { name: "Ciara Myst" },
    { name: "Darlene Mitchell" },
    { name: "DD Fuego" },
    { name: "Discord Addams" },
    { name: "Jane Don't" },
    { name: "Juicy Love Dion" },
    { name: "Kenya Pleaser" },
    { name: "Mandy Mango" },
    { name: "Mia Starr" },
    { name: "Myki Meeks" },
    { name: "Nini Coco" },
    { name: "Vita VonTesse Starr" },
  ],

  multipliers: [
    { slot: 1, value: 2.5 },
    { slot: 2, value: 2.0 },
    { slot: 3, value: 1.5 },
    { slot: 4, value: 1.0 },
  ],
} as const;
