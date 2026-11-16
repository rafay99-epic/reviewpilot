---
title: The score
summary: Computed from verified findings, never asked of the model.
---

| Score | Meaning |
| --- | --- |
| 5/5 | No verified issues |
| 4/5 | Minor issues only |
| 3/5 | At least one major issue |
| 2/5 | A critical issue: security, privacy, data loss, a broken build |
| 1/5 | Several critical issues |

Because it is derived from findings, the score only moves when findings change. The ReviewPilot check passes at 5/5 and fails below it, so "green check" means "no verified issues". Below 5/5 the summary and the check say what is in the way, for example *Not 5/5 because of: 2 minor*, and how to clear it. A repo that lets minor findings through sets `review.pass_score: 4`.

## Getting to 5/5

<ol class="steps">
<li>

### Read the findings

<p class="who">You or your coding agent</p>

Each inline comment names the problem, why it matters and the lines that prove it. The summary lists every open one.

</li>
<li>

### Fix and push, or answer

<p class="who">You</p>

Push a fix, or reply to the comment: "fixed in…", or why it is not worth fixing. Resolving the thread dismisses it outright.

</li>
<li>

### ReviewPilot checks again

<p class="who">ReviewPilot · on the push</p>

It reviews only the lines you changed, checks open findings against the new code, and updates the score. Code it already reviewed is not reviewed again, and new findings on these follow-up pushes must be major or critical, so the score settles. At 5/5 the check turns green.

</li>
</ol>

To block merges below 5/5, add a branch ruleset that requires the **ReviewPilot** status check.

## Across pushes

On every push, open findings are checked again against the new code:

- **Fixed.** ReviewPilot replies "Fixed in" with the commit and collapses the comment as outdated. It also resolves the thread when its token has Contents write; GitHub requires that for an App to resolve threads.
- **Still open.** It stays in the table with its original wording. A finding whose file and cited code did not change since the last review keeps its verdict without being verified again.
- **Replied to.** When the PR author or a maintainer replied, the finding is checked again with the reply as context, whatever changed. If the code bears the reply out, it is fixed ("Checked at … no longer an issue"); if not, it is dismissed on the reply ("Still present at … dismissed on your reply"). Either way ReviewPilot answers on the thread and closes it.
- **New.** Posted inline, counted in the delta line. After the first review, only major and critical findings are raised (`review.follow_up_min_severity`); a minor nit in a fix does not hold the score at 4/5.

A finding is dismissed, and never raised again, when someone other than ReviewPilot resolves its thread, or when a reply to it is not borne out by the code.

State lives in a hidden marker inside the summary comment. There is no database, and the PR carries its own history.
