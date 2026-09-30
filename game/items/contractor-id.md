---
type: item
name: Contractor ID card
startWith: true
key: I
usableOn: "[[Arthur]]"
once: true
effects:
  - item contractor-id shown
---

# Contractor ID card

```text
┌ CONTRACTOR ACCESS ─────────────────┐
│ ▧   WEST SHIPPING CONCERN          │
│     SITE CONTRACTOR                │
│     AUTHORISED SERVICE PERSONNEL   │
│     04—C / TEMPORARY               │
└ SITE SERVICES / VISITOR CONTROL WSC┘
```

## Verbs
```yaml
Show Arthur: [item contractor-id shown]
Put away: []
```

The card shows a name. It does not prove the job. Showing it moves [[arthur-tree.canvas|the tree]] to `id-shown`. The company has no record of the player, so letting Arthur call ends in [[exposed]].
