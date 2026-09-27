export const SITE = {
  name: "Explore Shining Cities",
  url: "https://exploreshoiningcities.com",
  title: "Explore Shining Cities | See the cities you love in a different light",
  description:
    "Discover the places, experiences, neighborhoods, landmarks, food, culture, views and moments that make great cities shine.",
  tagline: "See the cities you love in a different light."
};

export const categories = [
  "Things to See",
  "Neighborhoods",
  "Food & Drink",
  "Events",
  "Hidden Gems",
  "City Views",
  "Waterfront",
  "Architecture",
  "Nightlife",
  "Parks",
  "Seasonal",
  "Quick Hits"
];

const driveImage = (id, width = 1800) =>
  `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`;

export const cities = [
  {
    slug: "chicago",
    name: "Chicago",
    brand: "Chicago Shining",
    socialBrand: "ChicagoShining",
    state: "Illinois",
    accent: "#ff625b",
    accentSoft: "#ffd9d6",
    hero: driveImage("1p4Z7H2JIz8XMIdYsx6iwg-d_1TxhEPhv"),
    heroAlt: "Buckingham Fountain glowing at night with the Chicago skyline behind it.",
    eyebrow: "Lakefront energy · architecture · neighborhoods",
    description:
      "Bold architecture, lakefront calm, neighborhood color and a skyline that changes with every hour.",
    intro:
      "Chicago Shining follows the city from the river to the lake, through landmark views, neighborhood streets and the small moments that make Chicago unmistakable.",
    featuredCategories: ["Architecture", "Waterfront", "Neighborhoods", "City Views", "Seasonal"],
    neighborhoods: ["Streeterville", "The Loop", "River North", "Pilsen", "Grant Park"],
    social: []
  },
  {
    slug: "los-angeles",
    name: "Los Angeles",
    brand: "Los Angeles Shining",
    socialBrand: "LosAngelesShining",
    state: "California",
    accent: "#8b7fff",
    accentSoft: "#e4e0ff",
    hero: driveImage("18mOTQnoqB7rEBfDyrwTdFOrHIC0gSdtQ"),
    heroAlt: "Griffith Observatory overlooking Los Angeles in warm late-day light.",
    eyebrow: "City views · coast · culture",
    description:
      "A city of shifting light, iconic overlooks, downtown geometry and California moments in between.",
    intro:
      "Los Angeles Shining explores LA as a collection of distinct scenes—from hillside landmarks and downtown streets to the coast and the quick-hit moments that define Southern California.",
    featuredCategories: ["City Views", "Architecture", "Things to See", "Neighborhoods", "Quick Hits"],
    neighborhoods: ["Griffith Park", "Downtown LA", "Hollywood", "Coastal LA"],
    social: [
      { label: "TikTok", href: "https://www.tiktok.com/@lashining1" }
    ]
  },
  {
    slug: "miami",
    name: "Miami",
    brand: "Miami Shining",
    socialBrand: "MiamiShining",
    state: "Florida",
    accent: "#59d6df",
    accentSoft: "#dffbff",
    hero: driveImage("1oeY9j0U90L3ELVNgSXZLdsceSWDRFkyt"),
    heroAlt: "A vivid Little Havana street scene in Miami.",
    eyebrow: "Culture · waterfront · tropical detail",
    description:
      "Color, culture, architecture and waterfront light from Little Havana to Biscayne Bay.",
    intro:
      "Miami Shining moves between neighborhood culture, historic design, waterfront views and the unmistakable energy of a city shaped by the tropics.",
    featuredCategories: ["Neighborhoods", "Architecture", "Waterfront", "Food & Drink", "Things to See"],
    neighborhoods: ["Little Havana", "Coconut Grove", "Downtown Miami", "Miami Beach"],
    social: [
      { label: "TikTok", href: "https://www.tiktok.com/@miamishining" }
    ]
  },
  {
    slug: "new-york",
    name: "New York",
    brand: "New York Shining",
    socialBrand: "NewYorkShining",
    state: "New York",
    accent: "#52e39a",
    accentSoft: "#d9fbea",
    hero: driveImage("1IaSFQpVEifjeEVICWa4giXac08dZdJNI"),
    heroAlt: "A wide aerial view of Central Park surrounded by Manhattan.",
    eyebrow: "Street energy · landmarks · skyline",
    description:
      "Parks, towers, neighborhoods and street-level detail across a city that never holds one mood for long.",
    intro:
      "New York Shining connects the skyline-scale icons with the neighborhood-scale details—from Central Park and Lower Manhattan to Chinatown, Hell's Kitchen and the streets between.",
    featuredCategories: ["City Views", "Neighborhoods", "Architecture", "Parks", "Nightlife"],
    neighborhoods: ["Central Park", "Lower Manhattan", "Chinatown", "Hell's Kitchen", "Midtown"],
    social: [
      { label: "TikTok", href: "https://www.tiktok.com/@nyshining8" }
    ]
  }
];

export const stories = [
  {
    city: "chicago",
    slug: "riverwalk",
    title: "Chicago Riverwalk",
    kicker: "Waterfront · Architecture",
    summary: "Where Chicago’s architecture, bridges and river traffic become one moving city view.",
    description:
      "The Riverwalk is one of the clearest ways to experience Chicago at street level and skyline scale at the same time. Follow the river, look up often, and let the bridges, towers and reflections do the storytelling.",
    neighborhood: "River North / The Loop",
    location: "Chicago Riverwalk, Chicago, Illinois",
    image: driveImage("1duyoYm1vVF7amoF-GyysU0z51_pGS4Bo"),
    imageAlt: "Marina City beside the Chicago Riverwalk.",
    categories: ["Waterfront", "Architecture", "City Views"],
    highlights: ["River-level skyline views", "Iconic bridges", "Day-to-night reflections"],
    published: "2026-09-26",
    updated: "2026-09-26",
    websiteStatus: "published",
    source: { mediaAssetId: "recY36LR3oeKGf6ZC", driveFileId: "1duyoYm1vVF7amoF-GyysU0z51_pGS4Bo" }
  },
  {
    city: "chicago",
    slug: "navy-pier",
    title: "Navy Pier",
    kicker: "Lakefront · Things to See",
    summary: "Big lake views, bright nights and an easy walk into Chicago’s waterfront personality.",
    description:
      "Navy Pier is at its best when you treat the lake as part of the experience. Walk the edge, look back toward the skyline and stay long enough to see how the scene changes as daylight gives way to city lights.",
    neighborhood: "Streeterville",
    location: "Navy Pier, Chicago, Illinois",
    image: driveImage("1Kw7qHijDJEtpg5s6zwhyF08ixzycOzZ-"),
    imageAlt: "Chicago lakefront and Navy Pier viewed from Ohio Street Beach.",
    categories: ["Waterfront", "Things to See", "Nightlife"],
    highlights: ["Lake Michigan views", "Skyline perspectives", "Nighttime atmosphere"],
    published: "2026-09-26",
    updated: "2026-09-26",
    websiteStatus: "published",
    source: { mediaAssetId: "recefr79yFTmD6CAU", driveFileId: "1Kw7qHijDJEtpg5s6zwhyF08ixzycOzZ-" }
  },
  {
    city: "chicago",
    slug: "buckingham-fountain",
    title: "Buckingham Fountain",
    kicker: "Grant Park · City Views",
    summary: "A classic Chicago foreground with the skyline rising behind it.",
    description:
      "Buckingham Fountain gives Grant Park a cinematic center of gravity. In daylight it frames the city with water and open sky; after dark, the fountain and skyline take on a completely different character.",
    neighborhood: "Grant Park",
    location: "Buckingham Fountain, Grant Park, Chicago, Illinois",
    image: driveImage("1p4Z7H2JIz8XMIdYsx6iwg-d_1TxhEPhv"),
    imageAlt: "Buckingham Fountain illuminated at night with Chicago behind it.",
    categories: ["Parks", "City Views", "Seasonal"],
    highlights: ["Skyline backdrop", "Evening light", "Grant Park setting"],
    published: "2026-09-26",
    updated: "2026-09-26",
    websiteStatus: "published",
    source: { mediaAssetId: "rec7Cq1m6DdGQuFdV", driveFileId: "1p4Z7H2JIz8XMIdYsx6iwg-d_1TxhEPhv" }
  },
  {
    city: "chicago",
    slug: "pilsen",
    title: "Pilsen",
    kicker: "Neighborhoods · Art",
    summary: "Murals, color and street-level detail in one of Chicago’s most visually expressive neighborhoods.",
    description:
      "Pilsen rewards a slower walk. The visual story is in the murals, storefronts, walls and changing blocks—an urban gallery where the neighborhood itself becomes the frame.",
    neighborhood: "Pilsen",
    location: "Pilsen, Chicago, Illinois",
    image: driveImage("1sFCvfqOCe_yCJaFvShZn3GMuCesFmoCi"),
    imageAlt: "A colorful Pilsen mural featuring a stylized Chicago scene.",
    categories: ["Neighborhoods", "Hidden Gems", "Architecture"],
    highlights: ["Large-scale murals", "Walkable visual details", "Neighborhood character"],
    published: "2026-09-26",
    updated: "2026-09-26",
    websiteStatus: "published",
    source: { mediaAssetId: "rec1nTwk171jxI4sA", driveFileId: "1sFCvfqOCe_yCJaFvShZn3GMuCesFmoCi" }
  },
  {
    city: "miami",
    slug: "little-havana",
    title: "Little Havana",
    kicker: "Neighborhoods · Culture",
    summary: "A neighborhood best discovered through its color, street life, music, food and everyday details.",
    description:
      "Little Havana is a place to explore at walking pace. Look beyond a single landmark and the neighborhood opens up through signs, storefronts, public art, gathering places and the street-level rhythm of Miami.",
    neighborhood: "Little Havana",
    location: "Little Havana, Miami, Florida",
    image: driveImage("1oeY9j0U90L3ELVNgSXZLdsceSWDRFkyt"),
    imageAlt: "A colorful street scene in Little Havana, Miami.",
    categories: ["Neighborhoods", "Food & Drink", "Hidden Gems"],
    highlights: ["Street culture", "Colorful visual identity", "Food and gathering places"],
    published: "2026-09-26",
    updated: "2026-09-26",
    websiteStatus: "published",
    source: { mediaAssetId: "recZ68XJcyKNwxyrH", driveFileId: "1oeY9j0U90L3ELVNgSXZLdsceSWDRFkyt" }
  },
  {
    city: "miami",
    slug: "vizcaya",
    title: "Vizcaya Museum & Gardens",
    kicker: "Architecture · Gardens",
    summary: "Ornate details, framed views and tropical greenery make every doorway feel composed.",
    description:
      "Vizcaya is a place where the details matter as much as the wide view. Stonework, gates, doors, gardens and waterfront sightlines create a layered visual experience that changes from room to room and path to path.",
    neighborhood: "Coconut Grove",
    location: "Vizcaya Museum and Gardens, Miami, Florida",
    image: driveImage("11dKY_iD6sP07hpbLZisFryA9W8WNv4Uy"),
    imageAlt: "Green arched doors framing a waterfront view at Vizcaya.",
    categories: ["Architecture", "Things to See", "Hidden Gems"],
    highlights: ["Historic architectural detail", "Tropical gardens", "Waterfront framing"],
    published: "2026-09-26",
    updated: "2026-09-26",
    websiteStatus: "published",
    source: { mediaAssetId: "rec0CPAq8dzLM0nRP", driveFileId: "11dKY_iD6sP07hpbLZisFryA9W8WNv4Uy" }
  },
  {
    city: "los-angeles",
    slug: "griffith-observatory",
    title: "Griffith Observatory",
    kicker: "City Views · Architecture",
    summary: "One landmark, multiple LA perspectives—from Art Deco details to a city-wide overlook.",
    description:
      "Griffith Observatory is both destination and viewpoint. The building holds its own visually, while the terraces and hillside setting open Los Angeles into a broad, layered panorama.",
    neighborhood: "Griffith Park",
    location: "Griffith Observatory, Los Angeles, California",
    image: driveImage("18mOTQnoqB7rEBfDyrwTdFOrHIC0gSdtQ"),
    imageAlt: "Griffith Observatory with Los Angeles stretching into the distance.",
    categories: ["Things to See", "Architecture", "City Views"],
    highlights: ["Elevated city views", "Distinctive architecture", "Golden-hour light"],
    published: "2026-09-26",
    updated: "2026-09-26",
    websiteStatus: "published",
    source: { mediaAssetId: "recANNQOH4MQnTxlt", driveFileId: "18mOTQnoqB7rEBfDyrwTdFOrHIC0gSdtQ" }
  },
  {
    city: "los-angeles",
    slug: "downtown-los-angeles",
    title: "Downtown Los Angeles",
    kicker: "Architecture · City Views",
    summary: "A dense mix of towers, streets, traffic and changing light at the center of LA.",
    description:
      "Downtown Los Angeles reads differently from block to block and hour to hour. From elevated skyline views to street-level movement, the appeal is in the contrast between scale, geometry and Southern California light.",
    neighborhood: "Downtown LA",
    location: "Downtown Los Angeles, California",
    image: driveImage("1yAPWJZntmV10GCY9f8QvpG-wERUGXIZO"),
    imageAlt: "Downtown Los Angeles skyline with mountains in the distance.",
    categories: ["Architecture", "City Views", "Nightlife"],
    highlights: ["Skyline geometry", "Street-level motion", "Day-to-night contrast"],
    published: "2026-09-26",
    updated: "2026-09-26",
    websiteStatus: "published",
    source: { mediaAssetId: "recBb4GFLITXlPXmL", driveFileId: "1yAPWJZntmV10GCY9f8QvpG-wERUGXIZO" }
  },
  {
    city: "new-york",
    slug: "central-park",
    title: "Central Park",
    kicker: "Parks · City Views",
    summary: "Green space at city scale, framed on every side by Manhattan.",
    description:
      "Central Park gives New York room to breathe without ever letting you forget the city around it. Paths, rock outcrops, water, trees and skyline edges constantly redraw the view.",
    neighborhood: "Manhattan",
    location: "Central Park, Manhattan, New York City",
    image: driveImage("1IaSFQpVEifjeEVICWa4giXac08dZdJNI"),
    imageAlt: "Aerial view across Central Park and surrounding Manhattan.",
    categories: ["Parks", "City Views", "Things to See"],
    highlights: ["Skyline-framed green space", "Multiple walking routes", "Seasonal change"],
    published: "2026-09-26",
    updated: "2026-09-26",
    websiteStatus: "published",
    source: { mediaAssetId: "recXSBgxIH2JtLZ6x", driveFileId: "1IaSFQpVEifjeEVICWa4giXac08dZdJNI" }
  },
  {
    city: "new-york",
    slug: "world-trade-center",
    title: "One World Trade & Lower Manhattan",
    kicker: "Architecture · Lower Manhattan",
    summary: "A landmark that changes character from harbor-scale skyline to quiet street-level detail.",
    description:
      "One World Trade Center anchors Lower Manhattan visually, but the strongest experience comes from shifting scale—seeing the tower from a distance, then moving through the surrounding streets and memorial landscape.",
    neighborhood: "Financial District",
    location: "World Trade Center, Lower Manhattan, New York City",
    image: driveImage("1lO7OKdUUyel-2OLtcg5oFZoV4xJ5oZ21"),
    imageAlt: "One World Trade Center rising behind the 9/11 Memorial area.",
    categories: ["Architecture", "City Views", "Things to See"],
    highlights: ["Lower Manhattan skyline", "Street-to-sky perspective", "Reflective public space"],
    published: "2026-09-26",
    updated: "2026-09-26",
    websiteStatus: "published",
    source: { mediaAssetId: "reccmtrReY7U39YyA", driveFileId: "1lO7OKdUUyel-2OLtcg5oFZoV4xJ5oZ21" }
  }
];

export const publishedStories = stories.filter((story) => story.websiteStatus === "published");

export function getCity(slug) {
  return cities.find((city) => city.slug === slug);
}

export function getCityStories(slug) {
  return publishedStories.filter((story) => story.city === slug);
}

export function storyUrl(story) {
  return `/${story.city}/${story.slug}`;
}
