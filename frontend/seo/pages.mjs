// Search-intent landing pages. Each answers one query directly, then points at the
// relevant Lofin mode. Counts and model names come from the live catalog so the copy
// cannot drift from the product.
import { renderPage, table } from "./layout.mjs";
import { escapeHtml, formatTokens } from "./site.mjs";

const FEATURED = ["Qwen3.8 Omni Flash", "Gemini 3.7 Flash", "Mistral Large 4", "Qwen3.8 Max", "GPT-OSS 20B", "Gemma 4 31B", "Codestral", "GLM-4.7 Flash"];

export function landingPages(ctx) {
  const { groups, countLabel, freeCount, imageModels, defaultName, modified } = ctx;
  const byName = new Map(groups.map((g) => [g.name, g]));
  const featured = FEATURED.map((n) => byName.get(n)).filter(Boolean);
  const caps = (g) => escapeHtml(g.capabilities.join(", "));
  const featuredTable = table(
    ["Model", "Context", "Capabilities", "Details"],
    featured.map((g) => [`<strong>${escapeHtml(g.name)}</strong>`, formatTokens(g.contextLength), caps(g), `<a href="/ai-models/${g.slug}">Specs</a>`]),
  );
  const imageList = imageModels.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  const page = (opts) => renderPage({ modified, ...opts });
  const crumb = (name, path) => [{ name, path }];

  return [
    // 1 ─────────────────────────────────────────────────────────────────────
    page({
      path: "/free-ai-playground",
      title: `Free AI Playground — Chat with ${countLabel} AI Models, No Sign-Up | Lofin`,
      description: `Lofin is a free AI playground: chat with ${countLabel} AI models, compare them side by side, battle them blind, generate images and speech. Start instantly, no sign-up.`,
      h1: "A free AI playground for chatting with and comparing AI models",
      eyebrow: "Free AI playground",
      lede: `Lofin is a free, independently run AI playground. Open it and start chatting with ${defaultName} straight away — no sign-up — then sign in free to unlock ${countLabel} models and every mode.`,
      body: `
      <h2>What you can do in Lofin</h2>
      <ul>
        <li><strong>Direct</strong> — a normal chat with the model you pick.</li>
        <li><strong>Side by Side</strong> — send one prompt to two named models and read both answers together.</li>
        <li><strong>Battle</strong> — two anonymous models answer; you vote for the better one.</li>
        <li><strong>Agent</strong> — tool-using chats with live web search and optional memory.</li>
        <li><strong>Image</strong> — turn a text prompt into an image, or edit one you upload.</li>
        <li><strong>Text to Speech</strong> — convert text to audio you can play and download.</li>
      </ul>
      <h2>Free models you can try today</h2>
      <p>Lofin's catalog lists ${freeCount} models marked free across several providers. A few popular ones:</p>
      ${featuredTable}
      <p>See the full <a href="/ai-models">AI model directory</a> for every model, context length and capability.</p>
      <h2>What “free” means here</h2>
      <p>You don't pay Lofin to chat. The default model needs no account; signing in (also free) unlocks the rest. Because the models run on third-party providers' free tiers, daily usage limits can apply and individual models can change or disappear without notice. Chats are saved in your browser by default; signing in can sync them across devices.</p>
      <h2>Why use a playground instead of a single chatbot?</h2>
      <p>Different models are better at different jobs. A playground lets you test the same prompt across several of them in seconds, so you choose by what you actually see rather than by marketing. Read <a href="/compare-ai-models">how to compare AI models</a> for a simple method.</p>`,
      faqs: [
        { q: "Is Lofin really free?", a: "Yes, there's no charge to use Lofin. The default model works without an account, and signing in is free. Models run on third-party free tiers, so daily limits and availability changes can apply." },
        { q: "Do I need to sign up to use Lofin?", a: `No. You can start chatting with ${defaultName} immediately. Signing in (free) unlocks every other model and mode.` },
        { q: "Which AI models does Lofin have?", a: `Lofin currently lists ${groups.length} distinct models from providers including Google Gemini, Mistral, Qwen, Cohere, Z.ai GLM, and others, plus open-weight models such as GPT-OSS. See the model directory for the full list.` },
        { q: "Can Lofin generate images and speech too?", a: "Yes. Image mode creates and edits images, and Text to Speech mode turns text into downloadable audio." },
      ],
      crumbs: crumb("Free AI playground", "/free-ai-playground"),
    }),
    // 2 ─────────────────────────────────────────────────────────────────────
    page({
      path: "/compare-ai-models",
      title: "How to Compare AI Models Side by Side (Free Tool) | Lofin",
      description: `Compare AI models free: send one prompt to two models side by side, or battle two anonymous answers and vote. A simple method plus a free tool with ${countLabel} models.`,
      h1: "How to compare AI models side by side",
      eyebrow: "Compare AI models",
      lede: "The fastest way to compare AI models is to send the identical prompt to both and judge the answers against criteria you chose beforehand. Lofin does the sending for you, free.",
      body: `
      <h2>Two ways to compare in Lofin</h2>
      <h3>Side by Side — when you know which models you want</h3>
      <p>Pick two named models, write one prompt, and read both answers next to each other. Use it to choose between, say, a large model and its cheaper small sibling for a task you do often.</p>
      <h3>Battle — when you want an unbiased vote</h3>
      <p>Battle mode hides the model names. You read two anonymous answers, vote for the better one, and only then see which models they were. It removes brand bias from your judgment.</p>
      <h2>A five-minute method that works</h2>
      <ol>
        <li><strong>Write one realistic prompt.</strong> Include the audience, the format you want, and any facts that can't change.</li>
        <li><strong>Choose three to five criteria first</strong> — accuracy, clarity, tone, whether instructions were followed.</li>
        <li><strong>Run it on two or three models.</strong> Keep the prompt identical.</li>
        <li><strong>Check facts independently.</strong> A fluent answer is not necessarily a correct one.</li>
        <li><strong>Repeat once with a harder prompt</strong> before you commit to a favourite.</li>
      </ol>
      <p>The <a href="/guides">Lofin guides</a> go deeper on scorecards and verification.</p>
      <h2>Popular comparisons</h2>
      <p>Skim the specs first, then test: <a href="/compare">browse all head-to-head comparisons</a> or open the <a href="/ai-models">model directory</a>.</p>
      <h2>What to look at besides quality</h2>
      <ul>
        <li><strong>Context window</strong> — how much text a model can consider at once.</li>
        <li><strong>Image input</strong> — whether it can read screenshots and photos.</li>
        <li><strong>Reasoning</strong> — models built to work through multi-step problems.</li>
        <li><strong>Speed</strong> — smaller “flash” or “lite” variants answer faster.</li>
      </ul>`,
      faqs: [
        { q: "What's the best way to compare two AI models?", a: "Use the same prompt on both, decide your scoring criteria before reading the answers, and verify facts independently. Lofin's Side by Side mode runs the same prompt on two models at once." },
        { q: "Is there a free tool to compare AI models?", a: "Yes. Lofin's Side by Side and Battle modes are free. The default model works without an account and signing in is free." },
        { q: "What is blind model comparison?", a: "A comparison where the model names are hidden until after you choose the better answer, which removes brand bias. In Lofin this is Battle mode." },
      ],
      crumbs: crumb("Compare AI models", "/compare-ai-models"),
    }),
    // 3 ─────────────────────────────────────────────────────────────────────
    page({
      path: "/chatgpt-alternatives-free",
      title: `Free ChatGPT Alternatives: Chat with ${countLabel} AI Models Online | Lofin`,
      description: `Looking for a free ChatGPT alternative? Lofin lets you chat with Gemini, Mistral, Qwen, GPT-OSS and ${countLabel} models in one place — no sign-up to start.`,
      h1: "Free ChatGPT alternatives you can use right now",
      eyebrow: "ChatGPT alternatives",
      lede: `If you want a free alternative to ChatGPT, Lofin gives you ${countLabel} AI models in one interface — including Google's Gemini Flash models, Mistral, Qwen and open-weight models like GPT-OSS — and you can start without an account.`,
      body: `
      <h2>Why try more than one assistant?</h2>
      <p>No single chatbot is best at everything. Some are stronger at code, some at long documents, some at reading images. Having several in one place means you can switch when one gets stuck, rather than juggling accounts and tabs.</p>
      <h2>What Lofin offers</h2>
      ${featuredTable}
      <ul>
        <li>Chat with the model of your choice, with streaming answers and saved history.</li>
        <li>Run two models side by side, or vote between two anonymous ones.</li>
        <li>Live web search for current information, image generation, and text to speech.</li>
      </ul>
      <h2>An honest comparison</h2>
      <div class="callout"><strong>Lofin is not ChatGPT and isn't affiliated with OpenAI.</strong> Its catalog is mostly free-tier and open-weight models plus Google's Gemini Flash family; it does not include OpenAI's or Anthropic's flagship paid models. If you need those specifically, use their own apps. If you want to explore and compare free options, that's what Lofin is for.</div>
      <h2>Get started</h2>
      <p>Open <a href="/">lofin.dev</a> and type a prompt — ${escapeHtml(defaultName)} answers right away. Sign in free to unlock the rest of the catalog. Then try <a href="/compare-ai-models">comparing two models</a> on a task you care about.</p>`,
      faqs: [
        { q: "What is a good free alternative to ChatGPT?", a: "Several free options exist. Lofin is one that lets you try many models in one place — Gemini, Mistral, Qwen, GPT-OSS and more — and start without an account." },
        { q: "Is Lofin made by OpenAI?", a: "No. Lofin is independently run and is not affiliated with OpenAI, Google, or any model provider. It connects to third-party models." },
        { q: "Can Lofin search the web like ChatGPT?", a: "Yes. Lofin has built-in live web search, so you can ask about current events or recent information. See the page on AI chat with live web search." },
      ],
      crumbs: crumb("ChatGPT alternatives", "/chatgpt-alternatives-free"),
    }),
    // 4 ─────────────────────────────────────────────────────────────────────
    page({
      path: "/ai-model-arena",
      title: "AI Model Arena: Blind Battle Between AI Models, Free | Lofin",
      description: "Vote in a blind AI model battle: two anonymous models answer your prompt, you pick the winner, then see who they were. Free on Lofin — no sign-up to start.",
      h1: "A free AI model arena: battle two models blind",
      eyebrow: "AI model arena",
      lede: "In Lofin's Battle mode, two anonymous AI models answer the same prompt, you vote for the better answer, and only then are the models revealed. It's a quick way to learn which model you actually prefer.",
      body: `
      <h2>How Battle mode works</h2>
      <ol>
        <li>Write any prompt — a coding task, a tricky explanation, a piece of writing.</li>
        <li>Two models answer side by side, with names hidden.</li>
        <li>You vote for the better response.</li>
        <li>Lofin reveals which models you were comparing.</li>
      </ol>
      <h2>Why blind voting?</h2>
      <p>It's easy to favour a model because of its name or reputation. Hiding the names means your preference is based on the answer in front of you — useful if you're deciding which model to rely on for a recurring task.</p>
      <h2>When to use Side by Side instead</h2>
      <p>If you already know which two models you want to test — for example <a href="/compare/gemini-3-7-flash-vs-mistral-large-4">Gemini 3.7 Flash vs Mistral Large 4</a> — use Side by Side. You choose both models and see their answers together.</p>
      <h2>Tips for a fair battle</h2>
      <ul>
        <li>Use prompts from your real work, not trivia everyone has seen.</li>
        <li>Run several rounds; one answer can be a fluke.</li>
        <li>Verify facts yourself — the more confident answer isn't always the correct one.</li>
      </ul>
      <p>Lofin is an independent playground; it isn't affiliated with any other arena or leaderboard site, and votes are for your own benefit.</p>`,
      faqs: [
        { q: "What is an AI model battle?", a: "Two anonymous AI models answer the same prompt, and you vote for the better one before the models are revealed." },
        { q: "Is Battle mode free?", a: "Yes. Lofin is free to use, and signing in (also free) unlocks Battle mode along with every other mode." },
        { q: "Can I pick which models battle?", a: "Battle mode chooses anonymously. To choose both models yourself, use Side by Side mode." },
      ],
      crumbs: crumb("AI model arena", "/ai-model-arena"),
    }),
    // 5 ─────────────────────────────────────────────────────────────────────
    page({
      path: "/free-ai-image-generator",
      title: "Free AI Image Generator — Text to Image & Image Editing | Lofin",
      description: `Generate images from text for free with ${imageModels.slice(0, 3).join(", ")} and more, or edit a photo you upload. Part of Lofin's free AI playground.`,
      h1: "A free AI image generator in your browser",
      eyebrow: "Image generation",
      lede: "Describe what you want and Lofin's Image mode generates it; upload a picture and it can edit it. It's free to start, and sits alongside chat, comparison, and speech tools in one playground.",
      body: `
      <h2>Image models in Lofin</h2>
      <ul>${imageList}</ul>
      <p>Models differ in speed and style. Some are fast drafts; others are slower and more detailed, so Lofin lets you pick a quality level and aspect ratio. Availability can change as providers update their free tiers.</p>
      <h2>Getting good results</h2>
      <ol>
        <li><strong>Be specific about the subject</strong> — what it is, where it is, what it's doing.</li>
        <li><strong>Name the style</strong> — “watercolour”, “studio photo”, “flat vector icon”.</li>
        <li><strong>Add light and mood</strong> — “soft morning light”, “dramatic backlight”.</li>
        <li><strong>Iterate</strong> — change one thing at a time between generations.</li>
      </ol>
      <h2>Editing an existing image</h2>
      <p>Upload a picture and describe the change you want. Not every image model supports editing, so Lofin routes edits to one that does.</p>
      <h2>Good to know</h2>
      <p>Free image generation has daily limits and may add a watermark. Don't generate content that is illegal or infringes others' rights. Read the <a href="/terms">terms</a> for details.</p>`,
      faqs: [
        { q: "Is Lofin's image generator free?", a: "Yes, you can start for free. Daily usage limits apply because the models run on third-party free tiers." },
        { q: "Can I edit my own photo with Lofin?", a: "Yes. Image mode can edit an image you upload using a model that supports editing." },
        { q: "Which AI image models does Lofin use?", a: `Currently: ${imageModels.join(", ")}. The list can change as providers update.` },
      ],
      crumbs: crumb("Free AI image generator", "/free-ai-image-generator"),
    }),
    // 6 ─────────────────────────────────────────────────────────────────────
    page({
      path: "/free-text-to-speech",
      title: "Free Text to Speech — Convert Text to Audio Online | Lofin",
      description: "Turn text into natural-sounding speech for free. Pick a voice and speed, play it in your browser, and download the audio. Part of Lofin's free AI playground.",
      h1: "Free text to speech: turn text into audio",
      eyebrow: "Text to speech",
      lede: "Paste your text into Lofin's Text to Speech mode, choose a voice and speed, then play the result in your browser or download the audio file.",
      body: `
      <h2>What you can do</h2>
      <ul>
        <li>Convert articles, notes, scripts, or study material into spoken audio.</li>
        <li>Choose a voice and adjust the speaking speed.</li>
        <li>Play the audio immediately, or download it to keep.</li>
      </ul>
      <h2>Ideas for using it</h2>
      <ul>
        <li><strong>Proofreading by ear</strong> — mistakes you miss on screen often stand out when read aloud.</li>
        <li><strong>Listening to long text</strong> while commuting or exercising.</li>
        <li><strong>Draft voice-overs</strong> to check pacing before recording a final version.</li>
      </ul>
      <h2>Good to know</h2>
      <p>Generated speech is synthetic. Don't use it to impersonate a real person, and review the <a href="/terms">terms</a> before using audio commercially. Free usage has daily limits.</p>
      <p>Combine it with the rest of Lofin: draft in <a href="/free-ai-playground">chat</a>, then turn the final text into audio.</p>`,
      faqs: [
        { q: "Is Lofin's text to speech free?", a: "Yes, you can start for free; daily usage limits apply." },
        { q: "Can I download the audio?", a: "Yes. Generated speech can be played in the browser and downloaded." },
        { q: "Can I change the voice or speed?", a: "Yes. Text to Speech mode lets you choose a voice and a speaking speed." },
      ],
      crumbs: crumb("Free text to speech", "/free-text-to-speech"),
    }),
    // 7 ─────────────────────────────────────────────────────────────────────
    page({
      path: "/ai-chat-with-web-search",
      title: "AI Chat with Live Web Search — Free, Up-to-Date Answers | Lofin",
      description: "Ask AI about today's news and recent facts. Lofin adds live web search to its chat models, shows result links, and can find videos and images. Free to start.",
      h1: "AI chat with live web search for up-to-date answers",
      eyebrow: "Real-time AI",
      lede: "AI models only know what they were trained on, so they can be out of date. Lofin can search the live web and give the model fresh results to answer from, with the sources shown in the chat.",
      body: `
      <h2>How it works</h2>
      <ol>
        <li>You ask a question that needs current information — news, prices, release notes, recent events.</li>
        <li>Lofin searches the web (via Exa) and gathers relevant results.</li>
        <li>The model writes its answer using those results, and the links appear in the chat so you can check them.</li>
      </ol>
      <p>You can turn on Web search in Settings → General for automatic research, or simply ask Lofin to search, look something up, or open a link you paste.</p>
      <h2>More than text results</h2>
      <ul>
        <li><strong>Pasted links</strong> — share a public web page and ask for a summary.</li>
        <li><strong>Videos</strong> — ask to find a video and it can play inline in the chat.</li>
        <li><strong>Images</strong> — image searches show up as a gallery in the conversation.</li>
        <li><strong>Agent mode</strong> — combines search with tools and memory for multi-step tasks.</li>
      </ul>
      <h2>Prompts to try</h2>
      <ul>
        <li>“What changed in the latest release of [tool you use]? Search the web.”</li>
        <li>“Summarise today's top news about [topic] and list your sources.”</li>
        <li>“Compare current prices for [product] from a few stores.”</li>
      </ul>
      <div class="callout"><strong>Always verify what matters.</strong> Search improves freshness but not certainty: open the sources before relying on an answer for money, health, legal, or safety decisions.</div>`,
      faqs: [
        { q: "Can AI chat search the internet in real time?", a: "Yes. Lofin can search the live web and let the model answer from fresh results, showing links so you can check them." },
        { q: "Is web search in Lofin free?", a: "You can use Lofin for free. Web search is part of the free experience, subject to daily usage limits." },
        { q: "Does Lofin cite its sources?", a: "Search results appear with links in the chat, so you can open the pages the answer was based on. Always verify important details." },
      ],
      crumbs: crumb("AI chat with web search", "/ai-chat-with-web-search"),
    }),
  ];
}
