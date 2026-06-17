/* ==========================================================================
   Code the Future — Skills / Learning Outcomes taxonomy (window.CTFSkills)
   The durable hard skills kids build across the program, each mapped to the
   mission(s) that teach it. A skill is "earned" once a covering mission is
   complete. Mission identity:
     { mod:1, n:2 }  → badge "kids-m2"
     { mod:2, n:7 }  → badge "kids-mod2-7"
   Used by platform/skills.html (live, computes earned from badges) and mirrored
   in the public sales homepage (static "curriculum at a glance").
   ========================================================================== */
(function () {
  var categories = [
    {
      name: "AI Literacy",
      icon: "🧠",
      accent: "#2A5FF0",
      blurb: "What AI actually is, how it learns, and where it shows up in the real world.",
      skills: [
        { name: "What AI is — rules vs. learning", mod: 1, n: 2 },
        { name: "Patterns & training data", mod: 1, n: 3 },
        { name: "How AI sees — computer vision", mod: 1, n: 5 },
        { name: "How AI reads & writes — language", mod: 1, n: 6 },
        { name: "The attention trick / transformers", mod: 1, n: 7 },
        { name: "Neural networks", mod: 1, n: 8 },
        { name: "The story of AI", mod: 1, n: 9 },
        { name: "AI's strengths & limits — bias, hallucination", mod: 1, n: 10 },
        { name: "AI in the real world — health, energy, society", mod: 2, n: 2 },
        { name: "AI agents & the future of work", mod: 2, n: 5 }
      ]
    },
    {
      name: "Critical Thinking",
      icon: "🔍",
      accent: "#12B2BC",
      blurb: "Solving problems, spotting patterns, and judging whether an answer is actually right.",
      skills: [
        { name: "Problem solving", mod: 1, n: 1 },
        { name: "Pattern recognition", mod: 1, n: 3 },
        { name: "Evaluating AI output — “is it right?”", mod: 1, n: 10 },
        { name: "Decision-making", mod: 2, n: 6 },
        { name: "Ethical reasoning — fairness, help-or-hurt", mod: 2, n: 6 }
      ]
    },
    {
      name: "Communication",
      icon: "💬",
      accent: "#FF5A38",
      blurb: "Explaining ideas clearly, writing great instructions, and working with a team.",
      skills: [
        { name: "Explaining ideas clearly — “teach it back”", mod: 1, n: 2 },
        { name: "Writing clear instructions & prompts", mod: 1, n: 12 },
        { name: "Collaborating with a cohort", mod: 2, n: 11 },
        { name: "Listening & weighing other views", mod: 2, n: 10 }
      ]
    },
    {
      name: "Digital Citizenship",
      icon: "🛡️",
      accent: "#7C5CFF",
      blurb: "Privacy, fairness, safety, and understanding who controls technology.",
      skills: [
        { name: "Online privacy & your data", mod: 2, n: 7 },
        { name: "Fairness & bias awareness", mod: 1, n: 10 },
        { name: "Safety & kindness online", mod: 2, n: 6 },
        { name: "Who controls technology", mod: 2, n: 9 }
      ]
    },
    {
      name: "Building & Operator Skills",
      icon: "🛠️",
      accent: "#FFB320",
      blurb: "Algorithms, debugging, and using real AI tools to design and build helpers.",
      skills: [
        { name: "Step-by-step instructions / algorithms", mod: 1, n: 4 },
        { name: "Debugging & iterating", mod: 1, n: 11 },
        { name: "Designing an AI helper", mod: 2, n: 11 },
        { name: "Using real AI tools", mod: 1, n: 12 }
      ]
    },
    {
      name: "Creativity",
      icon: "🎨",
      accent: "#2FBF71",
      blurb: "Making art, designing characters, and inventing solutions to real problems.",
      skills: [
        { name: "Making art & remixing with AI", mod: 1, n: 5 },
        { name: "Designing your own character", mod: 1, n: 1 },
        { name: "Inventing solutions to real problems", mod: 2, n: 3 }
      ]
    }
  ];

  // Badge key a mission maps to: mod 1 → "kids-mN", mod 2 → "kids-mod2-N".
  function badgeKey(skill) {
    return skill.mod === 2 ? "kids-mod2-" + skill.n : "kids-m" + skill.n;
  }

  window.CTFSkills = { categories: categories, badgeKey: badgeKey };
})();
