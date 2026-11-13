# Detection reference

Memory Mirror uses ordered, deterministic detectors. There is no AI model or network lookup. The same supported input and scan options produce the same matches; report-generation timestamps still change. Findings and confidence labels are review heuristics, not verified personal facts or calibrated probabilities.

## What is scanned

| Source | Scanned by default | Why |
| --- | --- | --- |
| Your messages | Yes | This is what you shared. |
| Supported custom-instruction fields | Yes | Included when present in the supplied ChatGPT export. |
| Supported attachment names | Yes | Filenames can contain identifying details even when file contents are not analyzed. |
| Supported extracted-text fields in Claude input | Yes, when present | The reader uses supplied text; it does not open original attachments or extract missing text. |
| Saved memories (`memories*.json` or a `.txt`) | Yes | Stored about you by the assistant. |
| Assistant replies | Only with **Also scan assistant replies** | Replies may repeat or invent personal details; including them can add matches. |
| System and tool messages | Never | They are not written by you. |

For supported ChatGPT message trees, every readable branch present in the input is scanned, including earlier edits when the export contains them. Memory Mirror cannot recover deleted text or content that is absent from the supplied files.

The Claude reader normalizes supported `chat_messages` lists and their text blocks. It retains the Claude source label and forms an account-side conversation link when the supplied identifier has the expected shape. An export may omit original attachments or other product data; no reader can analyze content that was not supplied.

Open WebUI history nodes, SillyTavern `mes` records and normalized role/content JSON enter the same detector pipeline. The model behind a frontend does not change that pipeline. Structured user messages are scanned by default, assistant text is opt-in, and system/tool text is excluded. Plain text lacks role metadata and is treated as user-authored. See [input formats](input-formats.md) for fields that are intentionally ignored.

## Categories

| Category | Weight | Detectors |
| --- | ---: | --- |
| Secrets & credentials | 10 | Complete or truncated private-key blocks; provider-shaped API keys and tokens; JSON Web Tokens; database URLs with passwords; "my password is …" |
| Government IDs | 9 | US SSN (never-issued ranges rejected), Turkish national ID (checksum), UK National Insurance number, passport and driver's licence numbers written with a label |
| Health | 8 | First-person mentions of conditions, mental health, crisis terms, reproductive health, substance use, medication and treatment |
| Special categories | 8 | Religion, political opinion and sexual orientation in self-descriptions ("I'm a …"); immigration status; legal and criminal matters |
| Money | 7 | IBAN (MOD 97 and country length), payment cards (Luhn and network prefix), income, debt, savings, credit score, tax |
| Your watch words | 6 | Exact whole-word matches for terms you enter |
| Location | 5 | Street addresses (English and Turkish formats), "my address is …", postal codes, GPS coordinates, where you live or moved to |
| Other people | 4 | Relations ("my daughter"), named relations ("my mom Linda"), children with ages |
| Contact details | 4 | Email addresses, phone numbers (9–15 digits, written like a phone number) |
| Work | 4 | Employer, job title and employer, confidentiality markers such as "internal only" or "under NDA" |
| Identity | 3 | "My name is …", age, date of birth |

### First-person context

Health, special-category, immigration, legal and money terms count only inside a sentence that is about you:

- **High confidence** — possession or experience: *my*, *I have*, *I've*, *I was*, *I'm on*, *I take*, *I'm pregnant*, *I'm in recovery*, and similar.
- **Check** (medium) — any other first-person sentence, such as *I want to learn about …*.
- **Not counted** — sentences without *I* or *my*. "Tell me about sertraline" and "What is diabetes?" are questions, not disclosures.

Supplied memory and custom-instruction segments skip this first-person check. Separate third-person patterns include *Has a daughter named …*, *Works at …* and *Lives in …*. A filename or structured memory field identifies the intended input type; the app cannot independently verify whose details it contains.

### Overlaps

When two built-in detectors match overlapping text in the same message, the earlier rule wins: secrets, identifiers, contact details, location, identity, work, health, special categories, money and people. A bare relation ("my daughter") directly followed by a name is merged into the named-person finding.

Watch words are independent annotations. A short watch word inside a longer credential cannot suppress the credential finding; both can appear. Their category can therefore add review points for the same underlying span. Watch words are matched case-insensitively with whole-word boundaries; redacted-transcript substitutions use the exact detected spelling and case.

## Scoring

```
category points = weight × log₂(1 + unique items)
exposure score  = round(100 × (1 − e^(−total points / 40)))
```

Within a category, unique items are keyed by detector type and normalized value, so the same matched email in fifty messages contributes one unique email. Different detector types can still represent related information. The logarithm reduces the contribution of additional unique matches in a category. Levels: **Low** < 25 ≤ **Moderate** < 50 ≤ **High** < 75 ≤ **Very high**.

The score is a way to prioritize your review. It does not measure the probability or impact of harm, and two people with the same score can have very different risks.

The category names are an application taxonomy, not a legal classification. A checksum-valid card, IBAN or ID shape does not prove that the number belongs to a real account or person. Credential patterns are not checked against a provider.

## What it cannot detect

- Details written indirectly ("the thing I take for my mood") or with typos.
- Most languages other than English. Turkish national IDs and street addresses are supported; other non-English text is matched only by language-neutral patterns such as emails, cards and IBANs.
- Images, voice messages and files whose text is not in the export.
- Names without a relation word ("Mila said …"). Add them as watch words.
- Context that makes harmless facts sensitive, such as a combination of employer, city and age.
- Content that was deleted before the export was created.

## False positives

Expect some. Common examples: a password-like word after "PIN:", a relation word used figuratively ("my baby" for a project), or a political term in "I'm a liberal user of comments". Each finding shows its context so you can dismiss it quickly. Use **High confidence only** to hide weaker matches.

Report a false positive or a miss with a synthetic example — see [CONTRIBUTING.md](../CONTRIBUTING.md).
