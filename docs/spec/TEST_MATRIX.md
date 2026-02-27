# MVP Test Matrix

## Purpose

Executable test planning mapped from MVP requirements.

## Required Automated Tests

1. `RT-0 No-op save returns original text`
- Given: loaded XML, no content-changing command
- When: `save()`
- Then:
  - `mode === "original_noop"`
  - output equals original input

2. `RT-1 Pitch change produces serialized output`
- Given: loaded XML
- When: `change_to_pitch` succeeds
- Then:
  - dirty becomes true
  - `save().mode === "serialized_dirty"`

3. `TI-1 Overfull is rejected`
- Given: measure at capacity
- When: command increases occupied time beyond capacity
- Then:
  - `ok=false`
  - `MEASURE_OVERFULL`
  - DOM unchanged

4. `TI-2 Underfull handling`
- Given: command reduces occupied time below capacity
- Then:
  - command MAY succeed
  - warning MAY include `MEASURE_UNDERFULL`
  - implementation-dependent rest compensation behavior stays consistent

5. `BF-1 Voice mismatch rejected`
- Given: command voice does not match target note voice
- Then:
  - `ok=false`
  - `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`

6. `NK-1 Unsupported note kind rejected`
- Given: command targeting `grace`, `cue`, or `chord`
- Then:
  - `ok=false`
  - `MVP_UNSUPPORTED_NOTE_KIND`

7. `NK-2 Rest conversion allowed for change_to_pitch`
- Given: rest note target
- When: `change_to_pitch`
- Then:
  - MAY succeed
  - rest can be converted to pitched note

8. `DR-1 Dirty not set by ui_noop`
- Given: loaded XML
- When: `dispatch({ type: "ui_noop" })`
- Then:
  - `ok=true`
  - dirty unchanged

9. `BF-2 Structural boundary reject`
- Given: edit point at backup/forward boundary
- When: structural command (`insert_note_after` / `delete_note` / `split_note`)
- Then:
  - `ok=false`
  - `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`

10. `SP-1 split_note success`
- Given: editable note with even duration >= 2
- When: `split_note`
- Then:
  - target split into two notes with half duration each

11. `SP-2 split_note reject odd duration`
- Given: note with odd duration
- When: `split_note`
- Then:
  - `ok=false`
  - `MVP_INVALID_COMMAND_PAYLOAD`

12. `DL-1 delete_note handling`
- Given: non-chord target note
- When: `delete_note`
- Then:
  - target removed/replaced according to implementation
  - measure integrity rules preserved

13. `SV-1 Save rejects invalid score state`
- invalid duration -> `MVP_INVALID_NOTE_DURATION`
- invalid voice -> `MVP_INVALID_NOTE_VOICE`
- invalid pitch -> `MVP_INVALID_NOTE_PITCH`

14. `SV-2 Save rejects overfull`
- Given: current score overfull
- When: `save()`
- Then:
  - `ok=false`
  - `MEASURE_OVERFULL`

## CFFP Series (Cross-Format Focus Parity)

15. `CFFP-TRILL Minimal trill cross-format roundtrip`
- Input: minimal MusicXML with `trill-mark`
- Route: `MusicXML -> (musescore|midi|vsqx|abc|mei|lilypond) -> MusicXML`
- Then:
  - baseline pitch/start timing assertions for all formats
  - trill assertion per policy (`must-preserve` / `allowed-degrade`)

16. `CFFP-OCTSHIFT Minimal octave-shift cross-format roundtrip`
- Input: minimal MusicXML with `octave-shift`
- Then:
  - baseline pitch/timing assertions for all formats
  - octave-shift assertion per policy

17. `CFFP-SLUR Minimal slur cross-format roundtrip`
- Input: minimal MusicXML with slur start/stop
- Then:
  - slur start/stop assertion per policy

18. `CFFP-TIE Minimal tie cross-format roundtrip`
- Input: minimal MusicXML with tie start/stop
- Then:
  - tie linkage assertion per policy

19. `CFFP-STACCATO Minimal staccato cross-format roundtrip`
- Input: minimal MusicXML with staccato
- Then:
  - articulation assertion per policy

20. `CFFP-ACCENT Minimal accent cross-format roundtrip`
- Input: minimal MusicXML with accent
- Then:
  - articulation assertion per policy

21. `CFFP-GRACE Minimal grace cross-format roundtrip`
- Input: minimal MusicXML with grace (and slash variant where applicable)
- Then:
  - grace semantics assertion per policy

22. `CFFP-TUPLET Minimal tuplet cross-format roundtrip`
- Input: minimal MusicXML with tuplet/time-modification
- Then:
  - tuplet semantics assertion per policy

23. `CFFP-ACCIDENTAL Minimal accidental spelling/reset cross-format roundtrip`
- Input: minimal MusicXML with explicit natural + key-context sharp
- Then:
  - accidental spelling/reset assertion per policy

24. `CFFP-KEY-CHANGE Minimal mid-score key change cross-format roundtrip`
- Input: minimal MusicXML with measure-level key change
- Then:
  - key change assertion per policy

25. `CFFP-TIME-CHANGE Minimal mid-score time change cross-format roundtrip`
- Input: minimal MusicXML with measure-level time change
- Then:
  - time signature change assertion per policy

26. `CFFP-DOUBLE-BARLINE Minimal mid-score double barline cross-format roundtrip`
- Input: minimal MusicXML with `light-light` barline at measure boundary
- Then:
  - double-barline preservation/degrade assertion per policy

27. `CFFP-REPEAT-ENDING Minimal repeat/ending barline metadata cross-format roundtrip`
- Input: minimal MusicXML with forward/backward repeat and ending metadata
- Then:
  - repeat/ending metadata assertion per policy

28. `CFFP-TEMPO-MAP Minimal tempo change map cross-format roundtrip`
- Input: minimal MusicXML with two tempo events (120 -> 90)
- Then:
  - tempo map preservation/degrade assertion per policy

29. `CFFP-ACCIDENTAL-RESET Minimal accidental carry/reset cross-format roundtrip`
- Input: minimal MusicXML with `F#` in measure 1 and `F` in measure 2
- Then:
  - same-measure accidental carry and next-measure reset semantics are preserved

30. `CFFP-COURTESY-ACCIDENTAL Minimal courtesy accidental cross-format roundtrip`
- Input: minimal MusicXML with explicit courtesy natural (`cautionary="yes"`)
- Then:
  - courtesy accidental display metadata assertion per policy

31. `CFFP-BEAM-CONTINUITY Minimal beam continuity cross-format roundtrip`
- Input: minimal MusicXML with eighth-note beams split by rest
- Then:
  - beam continuity preservation/degrade assertion per policy

32. `CFFP-MULTIVOICE-BACKUP Minimal multi-voice backup cross-format roundtrip`
- Input: minimal MusicXML with voice1 + backup + voice2 in one measure
- Then:
  - multi-voice lane reconstruction assertion per policy

33. `CFFP-PICKUP-IMPLICIT Minimal pickup implicit-measure cross-format roundtrip`
- Input: minimal MusicXML with first measure `number="0"` and `implicit="yes"`
- Then:
  - pickup/implicit measure metadata preservation/degrade assertion per policy

34. `CFFP-TRILL-VARIANTS Minimal trill variants cross-format roundtrip`
- Input: minimal MusicXML with `trill-mark` + `wavy-line start/stop` + `accidental-mark`
- Then:
  - trill variant metadata preservation/degrade assertion per policy

35. `CFFP-TRANSPOSE Minimal transpose hint cross-format roundtrip`
- Input: minimal MusicXML with measure-level transpose hints (`diatonic/chromatic`)
- Then:
  - transpose metadata preservation/degrade assertion per policy

36. `CFFP-GRANDSTAFF-MAPPING Minimal grand-staff voice/staff mapping cross-format roundtrip`
- Input: minimal MusicXML with two staves (`staves=2`) and explicit `staff=1/2` note mapping
- Then:
  - grand-staff staff/voice mapping preservation/degrade assertion per policy

37. `CFFP-TURN Minimal turn ornament cross-format roundtrip`
- Input: minimal MusicXML with `ornaments/turn`
- Then:
  - turn ornament preservation/degrade assertion per policy

38. `CFFP-TURN-VARIANTS Minimal turn variants cross-format roundtrip`
- Input: minimal MusicXML with `ornaments/inverted-turn` + `ornaments/delayed-turn`
- Then:
  - turn-variant ornament preservation/degrade assertion per policy

39. `CFFP-MORDENT-VARIANTS Minimal mordent variants cross-format roundtrip`
- Input: minimal MusicXML with `ornaments/mordent` + `ornaments/inverted-mordent`
- Then:
  - mordent-variant ornament preservation/degrade assertion per policy

40. `CFFP-ORNAMENT-ACCIDENTAL-MARK Minimal ornament accidental-mark cross-format roundtrip`
- Input: minimal MusicXML with `ornaments/accidental-mark` (ornament context)
- Then:
  - ornament accidental-mark preservation/degrade assertion per policy

41. `CFFP-SCHLEIFER Minimal schleifer ornament cross-format roundtrip`
- Input: minimal MusicXML with `ornaments/schleifer`
- Then:
  - schleifer ornament preservation/degrade assertion per policy

42. `CFFP-SHAKE Minimal shake ornament cross-format roundtrip`
- Input: minimal MusicXML with `ornaments/shake`
- Then:
  - shake ornament preservation/degrade assertion per policy

43. `CFFP-DYNAMICS-BASIC Minimal dynamics marks cross-format roundtrip`
- Input: minimal MusicXML with `dynamics/pp` and `dynamics/ff`
- Then:
  - dynamics marks preservation/degrade assertion per policy

44. `CFFP-DYNAMICS-ACCENTED Minimal accented dynamics cross-format roundtrip`
- Input: minimal MusicXML with `dynamics/mf` and `dynamics/sfz`
- Then:
  - accented dynamics preservation/degrade assertion per policy

45. `CFFP-DYNAMICS-WEDGE Minimal wedge dynamics cross-format roundtrip`
- Input: minimal MusicXML with wedge `crescendo/diminuendo` + `stop`
- Then:
  - wedge dynamics preservation/degrade assertion per policy

46. `CFFP-FERMATA Minimal fermata cross-format roundtrip`
- Input: minimal MusicXML with `notations/fermata`
- Then:
  - fermata preservation/degrade assertion per policy

47. `CFFP-ARPEGGIATE Minimal arpeggiate cross-format roundtrip`
- Input: minimal MusicXML with `notations/arpeggiate` on chord notes
- Then:
  - arpeggiate preservation/degrade assertion per policy

48. `CFFP-BREATH-CAESURA Minimal breath/caesura cross-format roundtrip`
- Input: minimal MusicXML with `articulations/breath-mark` + `articulations/caesura`
- Then:
  - breath/caesura preservation/degrade assertion per policy

49. `CFFP-GLISSANDO Minimal glissando cross-format roundtrip`
- Input: minimal MusicXML with `glissando` start/stop
- Then:
  - glissando preservation/degrade assertion per policy

50. `CFFP-PEDAL Minimal pedal cross-format roundtrip`
- Input: minimal MusicXML with `direction-type/pedal` start/stop
- Then:
  - pedal marking preservation/degrade assertion per policy

51. `CFFP-SEGNO-CODA Minimal segno/coda cross-format roundtrip`
- Input: minimal MusicXML with `direction-type/segno` and `direction-type/coda`
- Then:
  - segno/coda symbol preservation/degrade assertion per policy

52. `CFFP-HARMONY-CHORDSYMBOL Minimal harmony chord-symbol cross-format roundtrip`
- Input: minimal MusicXML with `<harmony>` (`root` / `kind` / `bass`)
- Then:
  - harmony chord-symbol preservation/degrade assertion per policy

53. `CFFP-SLIDE Minimal slide cross-format roundtrip`
- Input: minimal MusicXML with `slide` start/stop
- Then:
  - slide preservation/degrade assertion per policy

54. `CFFP-TREMOLO Minimal tremolo cross-format roundtrip`
- Input: minimal MusicXML with `tremolo` (`single` + `start/stop`)
- Then:
  - tremolo preservation/degrade assertion per policy

55. `CFFP-REHEARSAL-MARK Minimal rehearsal-mark cross-format roundtrip`
- Input: minimal MusicXML with `direction-type/rehearsal` text
- Then:
  - rehearsal-mark text preservation/degrade assertion per policy

56. `CFFP-DA-CAPO-DAL-SEGNO Minimal jump-words/sound cross-format roundtrip`
- Input: minimal MusicXML with `words` (`Da Capo` / `Dal Segno`) + `sound` (`dacapo` / `dalsegno`)
- Then:
  - jump words and sound-attribute preservation/degrade assertion per policy

57. `CFFP-ENDING-TYPE Minimal ending-type cross-format roundtrip`
- Input: minimal MusicXML with ending `type` (`start` / `stop` / `discontinue`)
- Then:
  - ending-type preservation/degrade assertion per policy

58. `CFFP-TRIPLET-BRACKET Minimal triplet bracket/placement cross-format roundtrip`
- Input: minimal MusicXML with tuplet `bracket="yes"` and `placement="above"`
- Then:
  - triplet bracket/placement preservation/degrade assertion per policy

59. `CFFP-KEY-MODE Minimal key-mode cross-format roundtrip`
- Input: minimal MusicXML with `key/mode` transition (`major` -> `minor`)
- Then:
  - key-mode preservation/degrade assertion per policy

60. `CFFP-TECHNIQUE-TEXT Minimal technique-text cross-format roundtrip`
- Input: minimal MusicXML with `direction-type/words` (`pizz.` / `arco` / `con sord.`)
- Then:
  - technique-text preservation/degrade assertion per policy

61. `CFFP-ARTICULATION-EXT Minimal extended articulation cross-format roundtrip`
- Input: minimal MusicXML with `tenuto` / `staccatissimo` / `strong-accent`
- Then:
  - extended articulation preservation/degrade assertion per policy

62. `CFFP-NOTEHEAD Minimal notehead variants cross-format roundtrip`
- Input: minimal MusicXML with `notehead` variants (`cross` / `diamond`)
- Then:
  - notehead preservation/degrade assertion per policy

63. `CFFP-CLEF-MIDMEASURE Minimal mid-measure clef-change cross-format roundtrip`
- Input: minimal MusicXML with clef change within a measure
- Then:
  - mid-measure clef-change preservation/degrade assertion per policy

64. `CFFP-STEM-BEAM-DIR Minimal stem/beam-direction cross-format roundtrip`
- Input: minimal MusicXML with `stem` up/down and beam `begin/end`
- Then:
  - stem/beam-direction preservation/degrade assertion per policy

65. `CFFP-VOICE-STAFF-SWAP Minimal voice-staff-swap cross-format roundtrip`
- Input: minimal MusicXML where same voice appears on staff 1 and staff 2 in one measure
- Then:
  - voice-staff-swap preservation/degrade assertion per policy

66. `CFFP-MEASURE-STYLE Minimal measure-style cross-format roundtrip`
- Input: minimal MusicXML with `measure-style` (`slash` start/stop + `multiple-rest`)
- Then:
  - measure-style preservation/degrade assertion per policy

67. `CFFP-PRINT-LAYOUT-MIN Minimal print-layout cross-format roundtrip`
- Input: minimal MusicXML with `print` hints (`new-system` / `new-page`)
- Then:
  - print-layout hint preservation/degrade assertion per policy

68. `CFFP-MIDMEASURE-REPEAT Minimal mid-measure-repeat cross-format roundtrip`
- Input: minimal MusicXML with mid-measure repeat-like direction/sound markers
- Then:
  - mid-measure repeat marker preservation/degrade assertion per policy

69. `CFFP-OTTAVA-NUMBERING Minimal ottava-numbering cross-format roundtrip`
- Input: minimal MusicXML with multiple `octave-shift` lines (`number=1/2`)
- Then:
  - ottava-numbering preservation/degrade assertion per policy

70. `CFFP-LYRIC-BASIC Minimal lyric/melisma cross-format roundtrip`
- Input: minimal MusicXML with lyric text and melisma extension
- Then:
  - lyric/melisma preservation/degrade assertion per policy

71. `CFFP-LEFT-HAND-PIZZICATO Minimal left-hand-pizzicato cross-format roundtrip`
- Input: minimal MusicXML with `technical/left-hand-pizzicato`
- Then:
  - left-hand-pizzicato preservation/degrade assertion per policy

72. `CFFP-BOWING-DIRECTION Minimal bowing-direction cross-format roundtrip`
- Input: minimal MusicXML with `technical/up-bow` and `technical/down-bow`
- Then:
  - bowing-direction preservation/degrade assertion per policy

73. `CFFP-PERCUSSION-UNPITCHED Minimal unpitched percussion mapping cross-format roundtrip`
- Input: minimal MusicXML with `unpitched` + `display-step` / `display-octave`
- Then:
  - unpitched mapping preservation/degrade assertion per policy

74. `CFFP-PERCUSSION-NOTEHEAD Minimal percussion notehead variants cross-format roundtrip`
- Input: minimal MusicXML with percussion `notehead` variants (`x`, `triangle`)
- Then:
  - percussion notehead preservation/degrade assertion per policy

75. `CFFP-PERCUSSION-INSTRUMENT-ID Minimal percussion instrument-id mapping cross-format roundtrip`
- Input: minimal MusicXML with `score-instrument` and note-level `instrument id`
- Then:
  - instrument-id preservation/degrade assertion per policy

76. `CFFP-PERCUSSION-VOICE-LAYER Minimal percussion voice-layer split cross-format roundtrip`
- Input: minimal MusicXML with percussion lanes split by `voice` plus `backup/forward`
- Then:
  - voice-layer preservation/degrade assertion per policy

77. `CFFP-PERCUSSION-STAFF-LINE Minimal percussion staff-lines policy cross-format roundtrip`
- Input: minimal MusicXML with `staff-details/staff-lines`
- Then:
  - staff-lines preservation/degrade assertion per policy

78. `CFFP-TRANSPOSING-INSTRUMENT Minimal transposing-instrument hint cross-format roundtrip`
- Input: minimal MusicXML with `attributes/transpose` (e.g. Clarinet in A intent)
- Then:
  - transpose hint preservation/degrade assertion per policy

79. `CFFP-TIMEWISE-BACKUP-FORWARD Minimal backup/forward progression cross-format roundtrip`
- Input: minimal MusicXML with combined `backup` and `forward`
- Then:
  - timewise progression marker preservation/degrade assertion per policy

80. `CFFP-CROSS-STAFF-BEAM Minimal cross-staff beam cross-format roundtrip`
- Input: minimal MusicXML with two staves and beam spanning staff assignment
- Then:
  - cross-staff beam marker preservation/degrade assertion per policy

81. `CFFP-CHORD-SYMBOL-ALTER Minimal harmony alter/tension cross-format roundtrip`
- Input: minimal MusicXML with `harmony/degree` alters (e.g. `#11`, `b9`)
- Then:
  - harmony alter preservation/degrade assertion per policy

82. `CFFP-NOTE-TIES-CROSS-MEASURE Minimal cross-measure tie linkage cross-format roundtrip`
- Input: minimal MusicXML with `tie` start/stop across barline
- Then:
  - cross-measure tie preservation/degrade assertion per policy

83. `CFFP-MULTI-REST-COUNT Minimal multi-rest count cross-format roundtrip`
- Input: minimal MusicXML with `measure-style/multiple-rest`
- Then:
  - multiple-rest count preservation/degrade assertion per policy

84. `CFFP-REPEAT-JUMP-SOUND Minimal repeat-jump sound attributes cross-format roundtrip`
- Input: minimal MusicXML with direction `sound` attributes (`fine` / `tocoda` / `coda` / `segno`)
- Then:
  - jump sound attribute preservation/degrade assertion per policy

85. `CFFP-CUE-GRACE-MIX Minimal cue+grace mixed notation cross-format roundtrip`
- Input: minimal MusicXML mixing `cue` note and `grace` note
- Then:
  - cue/grace marker preservation/degrade assertion per policy

86. `CFFP-ACCIDENTAL-COURTESY-MODE Minimal courtesy accidental flags cross-format roundtrip`
- Input: minimal MusicXML with `accidental` cautionary/parentheses flags
- Then:
  - courtesy accidental flag preservation/degrade assertion per policy

87. `CFFP-LYRICS-MULTI-VERSE Minimal multi-verse lyric cross-format roundtrip`
- Input: minimal MusicXML with `lyric number=1,2`
- Then:
  - multi-verse lyric preservation/degrade assertion per policy

88. `CFFP-TEXT-ENCODING Minimal non-ASCII text encoding cross-format roundtrip`
- Input: minimal MusicXML with Japanese lyric and non-ASCII words
- Then:
  - text encoding preservation/degrade assertion per policy

89. `CFFP-HARMONIC-NATURAL-ARTIFICIAL Minimal harmonic variants cross-format roundtrip`
- Input: minimal MusicXML with `technical/harmonic` natural/artificial
- Then:
  - harmonic variant preservation/degrade assertion per policy

90. `CFFP-OPEN-STRING Minimal open-string technique cross-format roundtrip`
- Input: minimal MusicXML with `technical/open-string`
- Then:
  - open-string preservation/degrade assertion per policy

91. `CFFP-STOPPED Minimal stopped technique cross-format roundtrip`
- Input: minimal MusicXML with `technical/stopped`
- Then:
  - stopped technique preservation/degrade assertion per policy

92. `CFFP-SNAP-PIZZICATO Minimal snap-pizzicato technique cross-format roundtrip`
- Input: minimal MusicXML with `technical/snap-pizzicato`
- Then:
  - snap-pizzicato preservation/degrade assertion per policy

93. `CFFP-FINGERING Minimal fingering variants cross-format roundtrip`
- Input: minimal MusicXML with multiple `technical/fingering` values
- Then:
  - fingering preservation/degrade assertion per policy

94. `CFFP-STRING Minimal string indication cross-format roundtrip`
- Input: minimal MusicXML with `technical/string` values
- Then:
  - string indication preservation/degrade assertion per policy

95. `CFFP-DOUBLE-TRIPLE-TONGUE Minimal tonguing articulation cross-format roundtrip`
- Input: minimal MusicXML with `double-tongue` and `triple-tongue`
- Then:
  - tonguing articulation preservation/degrade assertion per policy

96. `CFFP-HEEL-TOE Minimal organ pedal technique cross-format roundtrip`
- Input: minimal MusicXML with `technical/heel` and `technical/toe`
- Then:
  - heel/toe preservation/degrade assertion per policy

97. `CFFP-PLUCK-TEXT Minimal pluck text cross-format roundtrip`
- Input: minimal MusicXML with `technical/pluck` text (`p`, `i`, `m`, `a`)
- Then:
  - pluck text preservation/degrade assertion per policy

98. `CFFP-BREATH-VARIANTS Minimal breath-mark variants cross-format roundtrip`
- Input: minimal MusicXML with breath-mark variant text (comma/tick)
- Then:
  - breath-mark variant preservation/degrade assertion per policy

99. `CFFP-BREATH-PLACEMENT Minimal breath-mark placement cross-format roundtrip`
- Input: minimal MusicXML with breath-mark placement/default position attributes
- Then:
  - breath placement preservation/degrade assertion per policy

100. `CFFP-CAESURA-STYLE Minimal caesura style-family cross-format roundtrip`
- Input: minimal MusicXML with multiple caesura marks
- Then:
  - caesura marker/style-family preservation/degrade assertion per policy
