// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { convertMeiToMusicXml, exportMusicXmlDomToMei } from "../../src/ts/mei-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

describe("MEI export", () => {
  it("exports simple MusicXML into MEI with scoreDef and notes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>MEI test</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const mei = exportMusicXmlDomToMei(doc);
    expect(mei).toContain("<mei ");
    expect(mei).toContain("<scoreDef");
    expect(mei).toContain("meter.count=\"4\"");
    expect(mei).toContain("<staffDef");
    expect(mei).toContain("<measure n=\"1\">");
    expect(mei).toContain("<note ");
    expect(mei).toContain("<rest ");
    expect(mei).toContain("<title>MEI test</title>");
  });

  it("imports simple MEI note sequence into MusicXML", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="4.0.1">
  <meiHead>
    <fileDesc><titleStmt><title>Imported from MEI</title></titleStmt><pubStmt><p>test</p></pubStmt></fileDesc>
  </meiHead>
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="1s">
            <staffGrp>
              <staffDef n="1" label="Lead" clef.shape="G" clef.line="2" />
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="4"/>
                  <rest dur="8"/>
                  <chord dur="8">
                    <note pname="e" oct="4"/>
                    <note pname="g" oct="4"/>
                  </chord>
                </layer>
              </staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>`;

    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector("work > work-title")?.textContent).toBe("Imported from MEI");
    expect(outDoc.querySelector("part-list > score-part > part-name")?.textContent).toBe("Lead");
    expect(outDoc.querySelector("part > measure > attributes > time > beats")?.textContent).toBe("4");
    expect(outDoc.querySelector("part > measure > attributes > key > fifths")?.textContent).toBe("1");
    expect(outDoc.querySelectorAll("part > measure > note").length).toBeGreaterThanOrEqual(4);
    expect(outDoc.querySelector("part > measure > note > pitch > step")?.textContent).toBe("C");
    expect(
      outDoc.querySelector(
        'part > measure > attributes > miscellaneous > miscellaneous-field[name="mks:mei-debug-count"]'
      )?.textContent
    ).toBe("0x0003");
    expect(
      outDoc.querySelector(
        'part > measure > attributes > miscellaneous > miscellaneous-field[name="mks:mei-debug-0001"]'
      )?.textContent
    ).toContain("k=note");
  });

  it("roundtrips miscellaneous-field via MEI annot", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Misc test</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
        <miscellaneous>
          <miscellaneous-field name="mks:test">hello</miscellaneous-field>
        </miscellaneous>
      </attributes>
      <note><rest/><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain('type="musicxml-misc-field"');
    expect(mei).toContain('label="mks:test"');
    expect(mei).toContain(">hello<");

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const field = outDoc.querySelector(
      'part > measure > attributes > miscellaneous > miscellaneous-field[name="mks:test"]'
    );
    expect(field).not.toBeNull();
    expect(field?.textContent).toBe("hello");
  });

  it("maps non-namespaced MEI misc labels to src:mei:* namespace", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="4.0.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp>
              <staffDef n="1" label="Lead" clef.shape="G" clef.line="2" />
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <annot type="musicxml-misc-field" label="legacy-token">abc123</annot>
                <layer n="1">
                  <rest dur="4"/>
                </layer>
              </staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>`;
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const field = outDoc.querySelector(
      'part > measure > attributes > miscellaneous > miscellaneous-field[name="src:mei:legacy-token"]'
    );
    expect(field).not.toBeNull();
    expect(field?.textContent).toBe("abc123");
  });

  it("clamps overfull MEI layer events to avoid MEASURE_OVERFULL in generated MusicXML", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="4.0.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="3" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2" /></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <rest dur="4"/>
                  <rest dur="4"/>
                  <note pname="d" oct="4" dur="8"/>
                  <note pname="a" oct="3" dur="8"/>
                  <note pname="f" oct="3" dur="8"/>
                </layer>
              </staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>`;
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const durations = Array.from(outDoc.querySelectorAll("part > measure > note > duration"))
      .map((node) => Number.parseInt(node.textContent || "0", 10))
      .filter((value) => Number.isFinite(value) && value > 0);
    const total = durations.reduce((sum, value) => sum + value, 0);
    expect(total).toBe(1440);
    expect(
      outDoc.querySelector(
        'part > measure > attributes > miscellaneous > miscellaneous-field[name="diag:count"]'
      )?.textContent
    ).toBe("1");
    expect(
      outDoc.querySelector(
        'part > measure > attributes > miscellaneous > miscellaneous-field[name="diag:0001"]'
      )?.textContent
    ).toContain("code=OVERFULL_CLAMPED");
  });

  it("adds implicit beams on MEI import for short-note groups", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="4.0.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="2" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2" /></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="8"/>
                  <note pname="d" oct="4" dur="8"/>
                  <note pname="e" oct="4" dur="8"/>
                  <note pname="f" oct="4" dur="8"/>
                </layer>
              </staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>`;
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("begin");
    expect(notes[1]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("end");
    expect(notes[2]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("begin");
    expect(notes[3]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("end");
  });

  it("roundtrips section-boundary double bar + explicit same-meter time via MEI measure metadata annot", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="24">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <barline location="right"><bar-style>light-light</bar-style></barline>
    </measure>
    <measure number="25">
      <attributes><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <barline location="left"><bar-style>light-light</bar-style></barline>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain('type="musicxml-measure-meta"');
    expect(mei).toContain("explicitTime=1");
    expect(mei).toContain("beats=2");
    expect(mei).toContain("beatType=4");
    expect(mei).toContain("doubleBar=right");
    expect(mei).toContain("doubleBar=left");

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const m2 = outDoc.querySelector("part > measure:nth-of-type(2)");
    expect(m2?.querySelector(":scope > attributes > time > beats")?.textContent?.trim()).toBe("2");
    expect(m2?.querySelector(":scope > attributes > time > beat-type")?.textContent?.trim()).toBe("4");
    const m24RightDouble = outDoc.querySelector('part > measure:nth-of-type(1) > barline[location="right"] > bar-style');
    const m25LeftDouble = outDoc.querySelector('part > measure:nth-of-type(2) > barline[location="left"] > bar-style');
    const hasBoundaryDouble =
      m24RightDouble?.textContent?.trim() === "light-light"
      || m25LeftDouble?.textContent?.trim() === "light-light";
    expect(hasBoundaryDouble).toBe(true);
  });

  it("roundtrips staccato/accent articulations between MusicXML and MEI", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><articulations><staccato/></articulations></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><articulations><accent/></articulations></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain('artic="stacc"');
    expect(mei).toContain('artic="acc"');

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(":scope > notations > articulations > staccato")).not.toBeNull();
    expect(second?.querySelector(":scope > notations > articulations > accent")).not.toBeNull();
  });

  it("roundtrips accidental display (natural/sharp/flat) between MusicXML and MEI", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><accidental>natural</accidental></note>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><accidental>sharp</accidental></note>
      <note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><accidental>flat</accidental></note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain('accid="n"');
    expect(mei).toContain('accid="s"');
    expect(mei).toContain('accid="f"');

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > accidental")?.textContent?.trim()).toBe("natural");
    expect(notes[1]?.querySelector(":scope > accidental")?.textContent?.trim()).toBe("sharp");
    expect(notes[2]?.querySelector(":scope > accidental")?.textContent?.trim()).toBe("flat");
  });

  it("roundtrips grace notes between MusicXML and MEI", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><grace slash="yes"/><pitch><step>C</step><octave>5</octave></pitch><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain('grace="acc"');

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(":scope > grace")).not.toBeNull();
    expect(second?.querySelector(":scope > duration")?.textContent?.trim()).toBe("480");
  });

  it("roundtrips tuplet timing and start/stop markers between MusicXML and MEI", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>160</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="start"/></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>5</octave></pitch>
        <duration>160</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
      </note>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>160</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="stop"/></notations>
      </note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain('num="3"');
    expect(mei).toContain('numbase="2"');
    expect(mei).toContain('mks-tuplet-start="1"');
    expect(mei).toContain('mks-tuplet-stop="1"');

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    const third = outDoc.querySelector("part > measure > note:nth-of-type(3)");
    expect(first?.querySelector(":scope > duration")?.textContent?.trim()).toBe("160");
    expect(second?.querySelector(":scope > duration")?.textContent?.trim()).toBe("160");
    expect(third?.querySelector(":scope > duration")?.textContent?.trim()).toBe("160");
    expect(first?.querySelector(":scope > time-modification > actual-notes")?.textContent?.trim()).toBe("3");
    expect(first?.querySelector(":scope > time-modification > normal-notes")?.textContent?.trim()).toBe("2");
    expect(first?.querySelector(':scope > notations > tuplet[type="start"]')).not.toBeNull();
    expect(third?.querySelector(':scope > notations > tuplet[type="stop"]')).not.toBeNull();
  });
});
