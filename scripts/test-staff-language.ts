// Unit: what language the person who picked up is speaking, and the vague yes that used to be a
// coin flip. Both are owner items from the round two order (08-07). Pure, no network, no database.
import { staffSpokeSpanish } from "../src/calls/staff-language";
import { reconcile, type ClerkVerdict } from "../src/voice/verdict";

let fail = 0;
const is = (got: unknown, want: unknown, label: string) => {
  if (JSON.stringify(got) === JSON.stringify(want)) console.log(`  ✓ ${label}`);
  else { console.error(`  ✗ ${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`); fail++; }
};

console.log("\n── the store's first line, in Spanish ──");
// Scene 18's own greeting, which is the one no check has ever run end to end.
is(staffSpokeSpanish("MVP's, buenas tardes. ¿En qué le puedo ayudar?"), true, "his own Spanish greeting");
is(staffSpokeSpanish("Buenos dias, en que le puedo ayudar"), true, "…and with every accent lost by the transcriber");
is(staffSpokeSpanish("Farmacia, digame."), true, "a Spanish counter answering with its own name");
is(staffSpokeSpanish("Si, tenemos algunos."), true, "a plain Spanish yes");
is(staffSpokeSpanish("Gracias por llamar, un momento por favor."), true, "thanks for calling, in Spanish");

console.log("\n── and an English line is never mistaken for one ──");
// THE WHOLE RISK IS ONE-SIDED. A false yes asks a confused English speaker a question in a language
// they do not speak; a false no is simply today's behaviour, which works. So these must all be no.
is(staffSpokeSpanish("Larry Vasquez, how can I help you?"), false, "the greeting almost every check gets");
is(staffSpokeSpanish("Thanks for calling MVP's. Can I help you?"), false, "…and the other one");
is(staffSpokeSpanish("No, nobody is up front right now, sorry."), false, "\"no\" inside an English sentence is not Spanish");
is(staffSpokeSpanish("Since when do we carry those?"), false, "\"si\" inside \"since\" is not Spanish");
is(staffSpokeSpanish("Sorry, when did you say?"), false, "\"en\" inside \"when\" is not Spanish");
is(staffSpokeSpanish("Good morning, MVP's Woodland Hills. How can I help today?"), false, "a long English greeting");
is(staffSpokeSpanish(""), false, "nothing said is not Spanish");
is(staffSpokeSpanish("Uh"), false, "one syllable is not enough to decide anything");

console.log("\n── the vague yes is no longer a coin flip ──");
// CHECKS 248 AND 257: the same words minutes apart, one In stock and one Couldn't tell. Our reader
// is settled (temperature nought, and it carries his 08-06 rule that describing what they found is a
// yes). The voice provider's own extraction is a different model with no such rule, so on a vague
// yes it landed "no" one check and "unclear" the next, and that is the whole of the coin flip.
const read = (o: Partial<ClerkVerdict>): ClerkVerdict => ({
  inStock: "yes", restockDay: null, restockTime: null, productForm: null, set: null, confidence: 0.9, reason: "", ...o,
});
const described = read({ productForm: "3-pack blister", confidence: 0.9 });

is(reconcile({ confirmed: null, soldOut: false, doesNotSell: false, statusKey: undefined }, described).statusKey,
  "in_stock", "provider unclear + our yes: In stock, exactly as check 248 came back");
is(reconcile({ confirmed: false, soldOut: false, doesNotSell: false, statusKey: undefined }, described).statusKey,
  "in_stock", "provider NO + our yes off what they described: In stock, where 257 said Couldn't tell");
is(reconcile({ confirmed: false, soldOut: false, doesNotSell: false, statusKey: undefined }, described).confirmed,
  true, "…and it is a real answer, so the customer is charged for it");

// NARROW ON PURPOSE. There has to be something the clerk actually described, and our reader has to
// be sure of it. A bare yes against a provider no is still an honest Couldn't tell.
is(reconcile({ confirmed: false, soldOut: false, doesNotSell: false, statusKey: undefined }, read({})).statusKey,
  "no_clear_answer", "a bare yes with nothing described is still a contradiction");
is(reconcile({ confirmed: false, soldOut: false, doesNotSell: false, statusKey: undefined }, read({ set: "Pitch Black", confidence: 0.4 })).statusKey,
  "no_clear_answer", "a description our own reader is unsure of decides nothing");
// And the other direction is untouched: the provider saying yes against our no is still no guess.
is(reconcile({ confirmed: true, soldOut: false, doesNotSell: false, statusKey: undefined }, read({ inStock: "no" })).statusKey,
  "no_clear_answer", "provider yes against our no is still an honest Couldn't tell");
// A hard sold out still wins outright over everything.
is(reconcile({ confirmed: false, soldOut: true, doesNotSell: false, statusKey: undefined }, described).statusKey,
  "sold_out", "a hard sold out still beats a description");

console.log(fail ? `\n${fail} FAILED\n` : "\nstaff language + the vague yes: all held\n");
process.exit(fail ? 1 : 0);
