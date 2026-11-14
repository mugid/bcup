const categoryEmojis: Record<string, string> = {
  kitchen: "🍳", clothing: "👕", furniture: "🛋️", electronics: "💻",
  food: "🍎", sports: "⚽", books: "📚", toys: "🧸",
  tools: "🛠️", plants: "🪴", beauty: "💄", bathroom: "🛁",
  office: "📎", pets: "🐾", art: "🎨", travel: "🧳",
};

export function categoryEmoji(name: string, emoji?: string) {
  return emoji || categoryEmojis[name.trim().toLocaleLowerCase("en-US")] || "📦";
}
