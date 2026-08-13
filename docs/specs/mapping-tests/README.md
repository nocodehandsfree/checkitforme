# The mapping tests (08-08)

## WHERE THIS STANDS (08-08, PM checkpoint)

**Green and on staging.** Mapper merged. His practice checks are 57 passing, 0 failing, and driving
the red ones is what found three real faults in the keys we press at whoever answers. One of those
would have written "press 123" into every store's saved route as a real menu choice, which would
have poisoned every map we made. Holding the merge until they were green was worth it.

**The one fault still open.** The keys only prove a machine when the NEXT thing said is word for
word the same line again (`keptTalkingAfterKnock`, navigator.ts ~706). A menu that simply moves on
to its next sentence counts as having stopped, which reads like a person, and then it falls back on
the word test that called CVS a person in the first place. It has to judge whether the noise stopped
at all, off the sound, not off the transcript. Fix this before any mapping test is dialed.

**What is actually proven.** One of the thirteen below, Direct pickup, has ever been dialed live, and
that dial happened before the keys existed, so even that half is untested. The other twelve have only
run on the bench. Getting faster through a menu was driven hard there, 339 checks with no phone. So
for nearly all of these the bench half is done and only the real dial is missing.

**What the robot store still needs**, before any of this can be dialed: it cannot hear a key press,
it cannot branch on which key was pressed, it has no menu voice of its own separate from Staff, and
it cannot loop back to the top of its menu. It also needs the menu wording word for word and a table
of which key leads where, which the owner approves the way he approved the nineteen Staff scripts.

Thirteen tests for the mapping side, written in the same shape as the twenty on the Charlie side:
a name, one plain sentence saying what happens, and what it proves.

The seven practice checks we had only tested the last mile, whether we called a person or a machine.
They said nothing about the rest of mapping's job: proving the department, getting faster, or a menu
that changed under us. Two of those seven are not mapping tests at all and are dropped here: Charlie
failing to join is a Charlie test, and two Staff on one check is the hand-over, which the twenty
already cover.

Every one of these needs the robot store to be able to answer as a MENU. Today it only ever answers
as Staff, which is why no menu has ever been walked for real without spending money on a stranger's
store.

## Direct: no menu at all
Staff pick up on the first second with nothing to walk. Proves we reach a person with no menu and never sit waiting for one.

## Menu: walked to a person
A menu reads its options, we press, a person answers. Proves the whole walk end to end on a store we have never called.

## Menu: the desk rings first
The menu puts us through, the desk rings once, then a person. Proves a ring never re-labels the menu that played before it.

## Menu: the desk rings out
The desk rings, nobody answers, and the menu comes back. Proves the returning menu is still the menu and not the person we were waiting for.

## Menu: no option fits
Nothing in the menu matches what we need. Proves we give up cleanly and say why, instead of pressing at random.

## Menu: it changed since we mapped it
The store re-recorded its menu, so our saved route no longer works. Proves the store takes itself off the site, files one job, and re-maps on its own.

## Menu: it acts on our keys
The menu remembers the keys we pressed at the start and jumps somewhere when its options begin. Proves that is still read as a machine and the run starts over from the top.

## Machine: a branded hello, then a person
A recording says the store's name, then a person arrives later. Proves the store's own name never decides it either way.

## Machine: voicemail that says hello
A mailbox greets exactly like a person. Proves it is read as a dead end before it is read as a person, so Charlie never joins one.

## Department: the wrong one
We reach a person who cannot help with cards. Proves the department is NOT marked proven, and the run tries another way through instead of locking the wrong door.

## Speed: pressing earlier works
Same menu, we press before the recording finishes. Proves the faster route is kept and becomes the one we use.

## Speed: pressing earlier fails
We press too early and the menu ignores it or loops. Proves the faster route is thrown away, the slower one is kept, and the reason is written down.

## Language: Spanish at pickup
Staff answer in Spanish. Proves they are read as a person, because no word list on earth covers every language.
