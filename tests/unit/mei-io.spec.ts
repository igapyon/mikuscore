// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("exports MusicXML transpose into MEI staffDef trans.diat/trans.semi", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Clarinet in A</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <transpose><diatonic>-2</diatonic><chromatic>-3</chromatic></transpose>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mei = exportMusicXmlDomToMei(doc);
    expect(mei).toContain('trans.diat="-2"');
    expect(mei).toContain('trans.semi="-3"');
  });

  it("exports MEI with default meiversion=5.1", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note></measure></part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mei = exportMusicXmlDomToMei(doc);
    expect(mei).toContain('meiversion="5.1"');
  });

  it("exports MEI with custom meiversion when specified", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note></measure></part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mei = exportMusicXmlDomToMei(doc, { meiVersion: "4.0.1" });
    expect(mei).toContain('meiversion="4.0.1"');
  });

  it("exports full-measure rest as MEI mRest", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><rest/><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mei = exportMusicXmlDomToMei(doc);
    expect(mei).toContain("<mRest ");
    expect(mei).toContain('dur="1"');
  });

  it("exports invisible rest (print-object=no) as MEI space", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note print-object="no"><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mei = exportMusicXmlDomToMei(doc);
    expect(mei).toContain("<space ");
    expect(mei).toContain("<rest ");
  });

  it("exports full-measure invisible rest as MEI mSpace", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note print-object="no"><rest/><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mei = exportMusicXmlDomToMei(doc);
    expect(mei).toContain("<mSpace ");
    expect(mei).toContain('dur="1"');
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

  it("imports mid-score scoreDef changes (time/key/clef) into subsequent MusicXML measure attributes", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff>
            </measure>
            <scoreDef meter.count="3" meter.unit="4" key.sig="2s">
              <staffGrp><staffDef n="1" clef.shape="F" clef.line="4"/></staffGrp>
            </scoreDef>
            <measure n="2">
              <staff n="1"><layer n="1"><note pname="d" oct="3" dur="4"/></layer></staff>
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

    expect(outDoc.querySelector('part > measure[number="1"] > attributes > time > beats')?.textContent?.trim()).toBe("4");
    expect(outDoc.querySelector('part > measure[number="1"] > attributes > key > fifths')?.textContent?.trim()).toBe("0");
    expect(outDoc.querySelector('part > measure[number="1"] > attributes > clef > sign')?.textContent?.trim()).toBe("G");

    expect(outDoc.querySelector('part > measure[number="2"] > attributes > time > beats')?.textContent?.trim()).toBe("3");
    expect(outDoc.querySelector('part > measure[number="2"] > attributes > key > fifths')?.textContent?.trim()).toBe("2");
    expect(outDoc.querySelector('part > measure[number="2"] > attributes > clef > sign')?.textContent?.trim()).toBe("F");
    expect(outDoc.querySelector('part > measure[number="2"] > attributes > clef > line')?.textContent?.trim()).toBe("4");
  });

  it("imports mid-score staffDef changes (key/clef/transpose) for the target staff", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff>
            </measure>
            <measure n="2">
              <staffDef n="1" key.sig="2" clef.shape="F" clef.line="4" trans.diat="1" trans.semi="2"/>
              <staff n="1"><layer n="1"><note pname="d" oct="4" dur="4"/></layer></staff>
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
    const measure2 = outDoc.querySelector('part > measure[number="2"]');
    expect(measure2).not.toBeNull();
    if (!measure2) return;
    expect(measure2.querySelector(":scope > attributes > key > fifths")?.textContent?.trim()).toBe("2");
    expect(measure2.querySelector(":scope > attributes > clef > sign")?.textContent?.trim()).toBe("F");
    expect(measure2.querySelector(":scope > attributes > clef > line")?.textContent?.trim()).toBe("4");
    expect(measure2.querySelector(":scope > attributes > transpose > diatonic")?.textContent?.trim()).toBe("1");
    expect(measure2.querySelector(":scope > attributes > transpose > chromatic")?.textContent?.trim()).toBe("2");
  });

  it("imports transposition from MEI staffDef trans.diat/trans.semi into MusicXML transpose", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp>
              <staffDef n="1" label="Clarinet in A" clef.shape="G" clef.line="2" trans.diat="-2" trans.semi="-3"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1"><layer n="1"><note pname="c" oct="5" dur="4"/></layer></staff>
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
    expect(outDoc.querySelector("part > measure > attributes > transpose > diatonic")?.textContent?.trim()).toBe("-2");
    expect(outDoc.querySelector("part > measure > attributes > transpose > chromatic")?.textContent?.trim()).toBe("-3");
  });

  it("imports transposition from scoreDef trans.diat/trans.semi when staffDef omits transposition", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0" trans.diat="-2" trans.semi="-3">
            <staffGrp>
              <staffDef n="1" label="Clarinet in A" clef.shape="G" clef.line="2"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1"><layer n="1"><note pname="c" oct="5" dur="4"/></layer></staff>
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
    expect(outDoc.querySelector("part > measure > attributes > transpose > diatonic")?.textContent?.trim()).toBe("-2");
    expect(outDoc.querySelector("part > measure > attributes > transpose > chromatic")?.textContent?.trim()).toBe("-3");
  });

  it("keeps accidental pitch on cross-measure tie even when tied note omits accid", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="f" oct="4" dur="4" accid="s" tie="i"/>
                </layer>
              </staff>
            </measure>
            <measure n="2">
              <staff n="1">
                <layer n="1">
                  <note pname="f" oct="4" dur="4" tie="t"/>
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
    const m1Alter = outDoc.querySelector('part > measure[number="1"] > note > pitch > alter')?.textContent?.trim();
    const m2Alter = outDoc.querySelector('part > measure[number="2"] > note > pitch > alter')?.textContent?.trim();
    expect(m1Alter).toBe("1");
    expect(m2Alter).toBe("1");
    expect(outDoc.querySelector('part > measure[number="1"] > note > tie[type="start"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure[number="2"] > note > tie[type="stop"]')).not.toBeNull();
  });

  it("prefers staffDef transposition over scoreDef transposition for target staff", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0" trans.diat="-2" trans.semi="-3">
            <staffGrp>
              <staffDef n="1" label="Eb Clarinet" clef.shape="G" clef.line="2" trans.diat="2" trans.semi="3"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1"><layer n="1"><note pname="g" oct="4" dur="4"/></layer></staff>
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
    expect(outDoc.querySelector("part > measure > attributes > transpose > diatonic")?.textContent?.trim()).toBe("2");
    expect(outDoc.querySelector("part > measure > attributes > transpose > chromatic")?.textContent?.trim()).toBe("3");
  });

  it("imports viola alto clef from staffDef child <clef> (C3)", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp>
              <staffDef n="1" label="Viola" lines="5">
                <clef shape="C" line="3"/>
              </staffDef>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff>
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

    expect(outDoc.querySelector('part > measure[number="1"] > attributes > clef > sign')?.textContent?.trim()).toBe("C");
    expect(outDoc.querySelector('part > measure[number="1"] > attributes > clef > line')?.textContent?.trim()).toBe("3");
  });

  it("keeps prior alto clef when later staffDef omits clef", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp>
              <staffDef n="1" label="Viola" lines="5" clef.shape="C" clef.line="3"/>
            </staffGrp>
          </scoreDef>
          <section>
            <scoreDef>
              <staffGrp>
                <staffDef n="1" label="Viola"/>
              </staffGrp>
            </scoreDef>
            <measure n="1">
              <staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff>
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

    expect(outDoc.querySelector('part > measure[number="1"] > attributes > clef > sign')?.textContent?.trim()).toBe("C");
    expect(outDoc.querySelector('part > measure[number="1"] > attributes > clef > line')?.textContent?.trim()).toBe("3");
  });

  it("applies scoreDef placed inside a measure before staff content", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <scoreDef key.sig="2s">
                <staffGrp><staffDef n="1" clef.shape="F" clef.line="4"/></staffGrp>
              </scoreDef>
              <staff n="1"><layer n="1"><note pname="d" oct="3" dur="4"/></layer></staff>
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

    expect(outDoc.querySelector('part > measure[number="1"] > attributes > key > fifths')?.textContent?.trim()).toBe("2");
    expect(outDoc.querySelector('part > measure[number="1"] > attributes > clef > sign')?.textContent?.trim()).toBe("F");
    expect(outDoc.querySelector('part > measure[number="1"] > attributes > clef > line')?.textContent?.trim()).toBe("4");
  });

  it("emits initial key/time/clef on first measure that contains target staff", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="3" meter.unit="4" key.sig="2f">
            <staffGrp>
              <staffDef n="1" label="Main" clef.shape="G" clef.line="2"/>
              <staffDef n="2" label="Other" clef.shape="F" clef.line="4"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="2"><layer n="1"><rest dur="4"/></layer></staff>
            </measure>
            <measure n="2">
              <staff n="1"><layer n="1"><note pname="b" oct="4" dur="4"/></layer></staff>
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

    const m2attrs = outDoc.querySelector('part[id="P1"] > measure[number="2"] > attributes');
    expect(m2attrs).not.toBeNull();
    expect(m2attrs?.querySelector(":scope > divisions")?.textContent?.trim()).toBe("480");
    expect(m2attrs?.querySelector(":scope > key > fifths")?.textContent?.trim()).toBe("-2");
    expect(m2attrs?.querySelector(":scope > time > beats")?.textContent?.trim()).toBe("3");
    expect(m2attrs?.querySelector(":scope > clef > sign")?.textContent?.trim()).toBe("G");
  });

  it("applies key signature implied accidental to pitch alter when MEI accid is omitted", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="1s">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="f" oct="4" dur="4"/>
                  <note pname="c" oct="4" dur="4"/>
                  <note pname="g" oct="4" dur="4"/>
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

    const n1 = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const n2 = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    const n3 = outDoc.querySelector("part > measure > note:nth-of-type(3)");
    expect(n1?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("1");
    expect(n2?.querySelector(":scope > pitch > alter")).toBeNull();
    expect(n3?.querySelector(":scope > pitch > alter")).toBeNull();
    expect(n1?.querySelector(":scope > accidental")).toBeNull();
  });

  it("carries explicit accidental within the same measure when following note omits accid", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="f" oct="4" dur="4" accid="s"/>
                  <note pname="f" oct="4" dur="4"/>
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
    expect(notes.length).toBe(2);
    expect(notes[0]?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("1");
    expect(notes[1]?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("1");
  });

  it("prefers staffDef key.sig over scoreDef key.sig for the target staff", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp>
              <staffDef n="1" label="Lead" key.sig="1s" clef.shape="G" clef.line="2"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="f" oct="4" dur="4"/>
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

    expect(outDoc.querySelector("part > measure > attributes > key > fifths")?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector("part > measure > note > pitch > alter")?.textContent?.trim()).toBe("1");
  });

  it("accepts MEI keysig alias (without dot) on scoreDef/staffDef", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" keysig="0">
            <staffGrp>
              <staffDef n="1" label="Lead" keysig="1s" clef.shape="G" clef.line="2"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="f" oct="4" dur="4"/>
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

    expect(outDoc.querySelector("part > measure > attributes > key > fifths")?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector("part > measure > note > pitch > alter")?.textContent?.trim()).toBe("1");
  });

  it("infers key fifths from MEI key.pname/key.mode when keysig is absent", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.pname="g" key.mode="major">
            <staffGrp>
              <staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="f" oct="4" dur="4"/>
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

    expect(outDoc.querySelector("part > measure > attributes > key > fifths")?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector("part > measure > note > pitch > alter")?.textContent?.trim()).toBe("1");
  });

  it("infers minor key fifths from MEI key.pname/key.mode when keysig is absent", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.pname="d" key.mode="minor">
            <staffGrp>
              <staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="b" oct="4" dur="4"/>
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

    expect(outDoc.querySelector("part > measure > attributes > key > fifths")?.textContent?.trim()).toBe("-1");
    expect(outDoc.querySelector("part > measure > note > pitch > alter")?.textContent?.trim()).toBe("-1");
  });

  it("infers key fifths from MEI key.pname + key.accid when keysig is absent", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.pname="f" key.accid="s" key.mode="major">
            <staffGrp>
              <staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="4"/>
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

    expect(outDoc.querySelector("part > measure > attributes > key > fifths")?.textContent?.trim()).toBe("6");
    expect(outDoc.querySelector("part > measure > note > pitch > alter")?.textContent?.trim()).toBe("1");
  });

  it("marks first short measure as implicit pickup when duration is shorter than meter", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1"><layer n="1"><note pname="c" oct="4" dur="8"/></layer></staff>
            </measure>
            <measure n="2">
              <staff n="1"><layer n="1"><note pname="d" oct="4" dur="1"/></layer></staff>
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
    const m1 = outDoc.querySelector('part > measure[number="1"]');
    expect(m1).not.toBeNull();
    if (!m1) return;
    expect((m1.getAttribute("implicit") || "").trim().toLowerCase()).toBe("yes");
    expect(m1.querySelector(":scope > note > duration")?.textContent?.trim()).toBe("240");
  });

  it("imports first child <mei> with score content when root is <meiCorpus>", () => {
    const meiCorpus = `<?xml version="1.0" encoding="UTF-8"?>
<meiCorpus xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <meiHead>
    <fileDesc><titleStmt><title>Corpus</title></titleStmt><pubStmt><p>test</p></pubStmt></fileDesc>
  </meiHead>
  <mei>
    <meiHead>
      <fileDesc><titleStmt><title>First score</title></titleStmt><pubStmt><p>test</p></pubStmt></fileDesc>
    </meiHead>
    <music>
      <body><mdiv><score>
        <scoreDef meter.count="4" meter.unit="4" key.sig="0"><staffGrp><staffDef n="1" label="S1" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
        <section><measure n="1"><staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff></measure></section>
      </score></mdiv></body>
    </music>
  </mei>
  <mei>
    <meiHead>
      <fileDesc><titleStmt><title>Second score</title></titleStmt><pubStmt><p>test</p></pubStmt></fileDesc>
    </meiHead>
    <music>
      <body><mdiv><score>
        <scoreDef meter.count="4" meter.unit="4" key.sig="0"><staffGrp><staffDef n="1" label="S2" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
        <section><measure n="1"><staff n="1"><layer n="1"><note pname="d" oct="5" dur="4"/></layer></staff></measure></section>
      </score></mdiv></body>
    </music>
  </mei>
</meiCorpus>`;

    const xml = convertMeiToMusicXml(meiCorpus);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("work > work-title")?.textContent?.trim()).toBe("First score");
    expect(outDoc.querySelector("part > measure > note > pitch > step")?.textContent?.trim()).toBe("C");
    expect(outDoc.querySelector("part > measure > note > pitch > octave")?.textContent?.trim()).toBe("4");
  });

  it("falls through empty first child <mei> in <meiCorpus> and imports next score-bearing <mei>", () => {
    const meiCorpus = `<?xml version="1.0" encoding="UTF-8"?>
<meiCorpus xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <mei>
    <meiHead><fileDesc><titleStmt><title>Header only</title></titleStmt><pubStmt><p>test</p></pubStmt></fileDesc></meiHead>
  </mei>
  <mei>
    <meiHead><fileDesc><titleStmt><title>Playable score</title></titleStmt><pubStmt><p>test</p></pubStmt></fileDesc></meiHead>
    <music>
      <body><mdiv><score>
        <scoreDef meter.count="4" meter.unit="4" key.sig="0"><staffGrp><staffDef n="1" label="S" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
        <section><measure n="1"><staff n="1"><layer n="1"><note pname="e" oct="5" dur="4"/></layer></staff></measure></section>
      </score></mdiv></body>
    </music>
  </mei>
</meiCorpus>`;

    const xml = convertMeiToMusicXml(meiCorpus);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("work > work-title")?.textContent?.trim()).toBe("Playable score");
    expect(outDoc.querySelector("part > measure > note > pitch > step")?.textContent?.trim()).toBe("E");
    expect(outDoc.querySelector("part > measure > note > pitch > octave")?.textContent?.trim()).toBe("5");
  });

  it("supports selecting meiCorpus child by index", () => {
    const meiCorpus = `<?xml version="1.0" encoding="UTF-8"?>
<meiCorpus xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <mei>
    <meiHead><fileDesc><titleStmt><title>First score</title></titleStmt><pubStmt><p>test</p></pubStmt></fileDesc></meiHead>
    <music>
      <body><mdiv><score>
        <scoreDef meter.count="4" meter.unit="4" key.sig="0"><staffGrp><staffDef n="1" label="S1" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
        <section><measure n="1"><staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff></measure></section>
      </score></mdiv></body>
    </music>
  </mei>
  <mei>
    <meiHead><fileDesc><titleStmt><title>Second score</title></titleStmt><pubStmt><p>test</p></pubStmt></fileDesc></meiHead>
    <music>
      <body><mdiv><score>
        <scoreDef meter.count="4" meter.unit="4" key.sig="0"><staffGrp><staffDef n="1" label="S2" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
        <section><measure n="1"><staff n="1"><layer n="1"><note pname="d" oct="5" dur="4"/></layer></staff></measure></section>
      </score></mdiv></body>
    </music>
  </mei>
</meiCorpus>`;

    const xml = convertMeiToMusicXml(meiCorpus, { meiCorpusIndex: 1 });
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("work > work-title")?.textContent?.trim()).toBe("Second score");
    expect(outDoc.querySelector("part > measure > note > pitch > step")?.textContent?.trim()).toBe("D");
    expect(outDoc.querySelector("part > measure > note > pitch > octave")?.textContent?.trim()).toBe("5");
  });

  it("throws when meiCorpusIndex is out of range", () => {
    const meiCorpus = `<?xml version="1.0" encoding="UTF-8"?>
<meiCorpus xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <mei><meiHead><fileDesc><titleStmt><title>A</title></titleStmt><pubStmt><p>x</p></pubStmt></fileDesc></meiHead></mei>
</meiCorpus>`;
    expect(() => convertMeiToMusicXml(meiCorpus, { meiCorpusIndex: 3 })).toThrow(/index out of range/i);
  });

  it("imports staff-level slur control events via startid/endid into note notations", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="n1" pname="c" oct="4" dur="4"/>
                  <note xml:id="n2" pname="d" oct="4" dur="4"/>
                </layer>
                <slur startid="#n1" endid="#n2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(':scope > notations > slur[type="start"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > slur[type="stop"]')).not.toBeNull();
  });

  it("imports staff-level tie control events via startid/endid into tie/tied", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="n1" pname="c" oct="4" dur="4"/>
                  <note xml:id="n2" pname="c" oct="4" dur="4"/>
                </layer>
                <tie startid="#n1" endid="#n2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(':scope > tie[type="start"]')).not.toBeNull();
    expect(first?.querySelector(':scope > notations > tied[type="start"]')).not.toBeNull();
    expect(second?.querySelector(':scope > tie[type="stop"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > tied[type="stop"]')).not.toBeNull();
  });

  it("resolves tie control-event startid from xml:id on chord child note", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <chord dur="4">
                    <note xml:id="cn1" pname="c" oct="4"/>
                    <note pname="e" oct="4"/>
                  </chord>
                  <note xml:id="n2" pname="c" oct="4" dur="4"/>
                </layer>
                <tie startid="#cn1" endid="#n2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const third = outDoc.querySelector("part > measure > note:nth-of-type(3)");
    expect(first?.querySelector(':scope > tie[type="start"]')).not.toBeNull();
    expect(third?.querySelector(':scope > tie[type="stop"]')).not.toBeNull();
  });

  it("applies tie-control accidental carry when tied stop omits accid", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="n1" pname="f" oct="4" dur="4" accid="s"/>
                  <note xml:id="n2" pname="f" oct="4" dur="4"/>
                </layer>
                <tie startid="#n1" endid="#n2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("1");
    expect(second?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("1");
    expect(first?.querySelector(':scope > tie[type="start"]')).not.toBeNull();
    expect(second?.querySelector(':scope > tie[type="stop"]')).not.toBeNull();
  });

  it("imports staff-level slur control events via tstamp/tstamp2", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="4"/>
                  <note pname="d" oct="4" dur="4"/>
                </layer>
                <slur tstamp="1" tstamp2="2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(':scope > notations > slur[type="start"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > slur[type="stop"]')).not.toBeNull();
  });

  it("imports staff-level tie control events via tstamp/tstamp2", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="4"/>
                  <note pname="c" oct="4" dur="4"/>
                </layer>
                <tie tstamp="1" tstamp2="2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(':scope > tie[type="start"]')).not.toBeNull();
    expect(first?.querySelector(':scope > notations > tied[type="start"]')).not.toBeNull();
    expect(second?.querySelector(':scope > tie[type="stop"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > tied[type="stop"]')).not.toBeNull();
  });

  it("imports layer-level slur control events via startid/endid", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="ln1" pname="e" oct="4" dur="4"/>
                  <note xml:id="ln2" pname="f" oct="4" dur="4"/>
                  <slur startid="#ln1" endid="#ln2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(':scope > notations > slur[type="start"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > slur[type="stop"]')).not.toBeNull();
  });

  it("imports layer-level tie control events via startid/endid", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="tn1" pname="g" oct="4" dur="4"/>
                  <note xml:id="tn2" pname="g" oct="4" dur="4"/>
                  <tie startid="#tn1" endid="#tn2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(':scope > tie[type="start"]')).not.toBeNull();
    expect(first?.querySelector(':scope > notations > tied[type="start"]')).not.toBeNull();
    expect(second?.querySelector(':scope > tie[type="stop"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > tied[type="stop"]')).not.toBeNull();
  });

  it("imports note-level MEI tie/slur attributes into MusicXML tie+tied and slur notations", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="4" tie="i" slur="i1"/>
                  <note pname="d" oct="4" dur="4" tie="t" slur="t1"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(':scope > tie[type="start"]')).not.toBeNull();
    expect(first?.querySelector(':scope > notations > tied[type="start"]')).not.toBeNull();
    expect(first?.querySelector(':scope > notations > slur[type="start"][number="1"]')).not.toBeNull();
    expect(second?.querySelector(':scope > tie[type="stop"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > tied[type="stop"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > slur[type="stop"][number="1"]')).not.toBeNull();
  });

  it("imports MEI graceGrp notes as MusicXML grace notes", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <graceGrp slash="yes">
                    <note pname="c" oct="5" dur="8"/>
                    <note pname="d" oct="5" dur="8"/>
                  </graceGrp>
                  <note pname="e" oct="5" dur="4"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    const third = outDoc.querySelector("part > measure > note:nth-of-type(3)");
    expect(first?.querySelector(":scope > grace[slash=\"yes\"]")).not.toBeNull();
    expect(second?.querySelector(":scope > grace[slash=\"yes\"]")).not.toBeNull();
    expect(first?.querySelector(":scope > duration")).toBeNull();
    expect(second?.querySelector(":scope > duration")).toBeNull();
    expect(third?.querySelector(":scope > duration")?.textContent?.trim()).toBe("480");
  });

  it("imports MEI beam/tuplet containers without dropping nested notes", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <beam>
                    <note pname="c" oct="4" dur="8"/>
                    <tuplet>
                      <note pname="d" oct="4" dur="8"/>
                      <note pname="e" oct="4" dur="8"/>
                    </tuplet>
                  </beam>
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
    const notes = outDoc.querySelectorAll("part > measure > note");
    expect(notes.length).toBe(3);
  });

  it("imports MEI dynam as MusicXML dynamics direction", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <dynam tstamp="2">mf</dynam>
                  <note pname="c" oct="4" dur="4"/>
                  <note pname="d" oct="4" dur="4"/>
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
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > mf")).not.toBeNull();
    expect(outDoc.querySelector("part > measure > direction > offset")?.textContent?.trim()).toBe("480");
  });

  it("imports measure-level MEI dynam with @staff into MusicXML dynamics direction", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="4"/>
                  <note pname="d" oct="4" dur="4"/>
                </layer>
              </staff>
              <dynam staff="1" tstamp="1">ff</dynam>
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
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > ff")).not.toBeNull();
  });

  it("imports MEI dynam free text as MusicXML words direction", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <dynam place="above">dolce</dynam>
                  <note pname="e" oct="4" dur="4"/>
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
    const dir = outDoc.querySelector("part > measure > direction");
    expect(dir?.getAttribute("placement")).toBe("above");
    expect(outDoc.querySelector("part > measure > direction > direction-type > words")?.textContent?.trim()).toBe("dolce");
  });

  it("imports MEI hairpin via startid/endid as MusicXML wedge start/stop", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="h1" pname="c" oct="4" dur="4"/>
                  <note xml:id="h2" pname="d" oct="4" dur="4"/>
                  <hairpin form="cres" startid="#h1" endid="#h2"/>
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
    expect(outDoc.querySelector('part > measure > direction:nth-of-type(1) > direction-type > wedge[type="crescendo"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure > direction:nth-of-type(2) > direction-type > wedge[type="stop"]')).not.toBeNull();
  });

  it("imports MEI hairpin via tstamp/tstamp2 as MusicXML wedge with offsets", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="4"/>
                  <note pname="d" oct="4" dur="4"/>
                  <hairpin form="dim" tstamp="1" tstamp2="2" place="below"/>
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
    const startDir = outDoc.querySelector("part > measure > direction:nth-of-type(1)");
    const stopDir = outDoc.querySelector("part > measure > direction:nth-of-type(2)");
    expect(startDir?.getAttribute("placement")).toBe("below");
    expect(startDir?.querySelector(':scope > direction-type > wedge[type="diminuendo"]')).not.toBeNull();
    expect(stopDir?.querySelector(':scope > direction-type > wedge[type="stop"]')).not.toBeNull();
    expect(stopDir?.querySelector(":scope > offset")?.textContent?.trim()).toBe("480");
  });

  it("imports MEI trill control event to MusicXML trill-mark notation", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="t1" pname="c" oct="4" dur="4"/>
                  <note pname="d" oct="4" dur="4"/>
                  <trill startid="#t1"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    expect(first?.querySelector(":scope > notations > ornaments > trill-mark")).not.toBeNull();
  });

  it("imports MEI control event using plist when startid is absent", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="p1" pname="c" oct="4" dur="4"/>
                  <note xml:id="p2" pname="d" oct="4" dur="4"/>
                  <trill plist="#p1 #p2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    expect(first?.querySelector(":scope > notations > ornaments > trill-mark")).not.toBeNull();
  });

  it("imports MEI slur span using plist+tstamp2 when startid/endid are absent", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="sp1" pname="c" oct="4" dur="4"/>
                  <note xml:id="sp2" pname="d" oct="4" dur="4"/>
                  <slur plist="#sp1" tstamp2="2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(':scope > notations > slur[type="start"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > slur[type="stop"]')).not.toBeNull();
  });

  it("uses accid.ges for pitch alter when visual accid is omitted", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="f" oct="4" dur="4" accid.ges="s"/>
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
    const note = outDoc.querySelector("part > measure > note");
    expect(note?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("1");
    // accid.ges is sounding-only; accidental glyph should stay absent unless accid is present.
    expect(note?.querySelector(":scope > accidental")).toBeNull();
  });

  it("uses chord-note accid.ges for alter on each chord member", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <chord dur="4">
                    <note pname="f" oct="4" accid.ges="s"/>
                    <note pname="b" oct="4" accid.ges="f"/>
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
    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes.length).toBe(2);
    expect(notes[0]?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("1");
    expect(notes[1]?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("-1");
  });

  it("imports MEI fermata control event to MusicXML fermata notation", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="e" oct="4" dur="4"/>
                  <note pname="f" oct="4" dur="4"/>
                  <fermata tstamp="2" place="below"/>
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
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(second?.querySelector(':scope > notations > fermata[type="inverted"]')).not.toBeNull();
  });

  it("imports MEI pedal via startid/endid as MusicXML pedal start/stop directions", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="p1" pname="c" oct="4" dur="4"/>
                  <note xml:id="p2" pname="d" oct="4" dur="4"/>
                  <pedal startid="#p1" endid="#p2" place="below"/>
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
    const startDir = outDoc.querySelector("part > measure > direction:nth-of-type(1)");
    const stopDir = outDoc.querySelector("part > measure > direction:nth-of-type(2)");
    expect(startDir?.getAttribute("placement")).toBe("below");
    expect(startDir?.querySelector(':scope > direction-type > pedal[type="start"]')).not.toBeNull();
    expect(stopDir?.querySelector(':scope > direction-type > pedal[type="stop"]')).not.toBeNull();
    expect(stopDir?.querySelector(":scope > offset")?.textContent?.trim()).toBe("480");
  });

  it("imports MEI pedal explicit stop event as single MusicXML pedal stop direction", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="e" oct="4" dur="4"/>
                  <note pname="f" oct="4" dur="4"/>
                  <pedal type="stop" tstamp="2"/>
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
    const dir = outDoc.querySelector("part > measure > direction");
    expect(dir?.querySelector(':scope > direction-type > pedal[type="stop"]')).not.toBeNull();
    expect(dir?.querySelector(":scope > offset")?.textContent?.trim()).toBe("480");
  });

  it("imports MEI gliss via startid/endid as MusicXML glissando start/stop notations", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="g1" pname="c" oct="4" dur="4"/>
                  <note xml:id="g2" pname="e" oct="4" dur="4"/>
                  <gliss startid="#g1" endid="#g2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(':scope > notations > glissando[type="start"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > glissando[type="stop"]')).not.toBeNull();
  });

  it("imports MEI gliss via tstamp/tstamp2 as MusicXML glissando start/stop notations", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="d" oct="4" dur="4"/>
                  <note pname="f" oct="4" dur="4"/>
                  <gliss tstamp="1" tstamp2="2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(':scope > notations > glissando[type="start"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > glissando[type="stop"]')).not.toBeNull();
  });

  it("imports MEI slide via startid/endid as MusicXML slide start/stop notations", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="s1" pname="c" oct="4" dur="4"/>
                  <note xml:id="s2" pname="e" oct="4" dur="4"/>
                  <slide startid="#s1" endid="#s2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(':scope > notations > slide[type="start"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > slide[type="stop"]')).not.toBeNull();
  });

  it("imports MEI octave via startid/endid as MusicXML octave-shift start/stop directions", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="o1" pname="c" oct="5" dur="4"/>
                  <note xml:id="o2" pname="d" oct="5" dur="4"/>
                  <octave startid="#o1" endid="#o2" dis="8" dis.place="above"/>
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
    const startDir = outDoc.querySelector("part > measure > direction:nth-of-type(1)");
    const stopDir = outDoc.querySelector("part > measure > direction:nth-of-type(2)");
    expect(startDir?.querySelector(':scope > direction-type > octave-shift[type="up"][size="8"]')).not.toBeNull();
    expect(stopDir?.querySelector(':scope > direction-type > octave-shift[type="stop"][size="8"]')).not.toBeNull();
    expect(stopDir?.querySelector(":scope > offset")?.textContent?.trim()).toBe("480");
  });

  it("imports MEI octave explicit stop event as single MusicXML octave-shift stop direction", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="a" oct="4" dur="4"/>
                  <note pname="b" oct="4" dur="4"/>
                  <octave type="stop" tstamp="2" dis="8"/>
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
    const dir = outDoc.querySelector("part > measure > direction");
    expect(dir?.querySelector(':scope > direction-type > octave-shift[type="stop"][size="8"]')).not.toBeNull();
    expect(dir?.querySelector(":scope > offset")?.textContent?.trim()).toBe("480");
  });

  it("imports MEI repeatMark segno/coda/fine into MusicXML directions", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="4"/>
                  <note pname="d" oct="4" dur="4"/>
                  <repeatMark tstamp="1">segno</repeatMark>
                  <repeatMark tstamp="2">coda</repeatMark>
                  <repeatMark>fine</repeatMark>
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
    expect(outDoc.querySelector("part > measure > direction > direction-type > segno")).not.toBeNull();
    expect(outDoc.querySelector("part > measure > direction > direction-type > coda")).not.toBeNull();
    const fineWords = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > words"))
      .map((node) => (node.textContent || "").trim().toLowerCase());
    expect(fineWords.includes("fine")).toBe(true);
  });

  it("imports MEI turn/mordent control events into MusicXML ornament notations", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="orn1" pname="c" oct="4" dur="4"/>
                  <note xml:id="orn2" pname="d" oct="4" dur="4"/>
                  <turn startid="#orn1" type="inverted"/>
                  <mordent startid="#orn2" type="upper"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(":scope > notations > ornaments > inverted-turn")).not.toBeNull();
    expect(second?.querySelector(":scope > notations > ornaments > mordent")).not.toBeNull();
  });

  it("imports MEI breath/caesura control events into MusicXML articulation notations", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="e" oct="4" dur="4"/>
                  <note pname="f" oct="4" dur="4"/>
                  <breath tstamp="1"/>
                  <caesura tstamp="2"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(":scope > notations > articulations > breath-mark")).not.toBeNull();
    expect(second?.querySelector(":scope > notations > articulations > caesura")).not.toBeNull();
  });

  it("imports MEI tupletSpan via startid/endid as MusicXML tuplet start/stop notations", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="ts1" pname="c" oct="4" dur="8"/>
                  <note xml:id="ts2" pname="d" oct="4" dur="8"/>
                  <note xml:id="ts3" pname="e" oct="4" dur="8"/>
                  <tupletSpan startid="#ts1" endid="#ts3"/>
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
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const third = outDoc.querySelector("part > measure > note:nth-of-type(3)");
    expect(first?.querySelector(':scope > notations > tuplet[type="start"]')).not.toBeNull();
    expect(third?.querySelector(':scope > notations > tuplet[type="stop"]')).not.toBeNull();
  });

  it("imports MEI beamSpan via plist and applies beams only to listed notes", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="bs1" pname="c" oct="4" dur="8"/>
                  <note xml:id="bs2" pname="d" oct="4" dur="8"/>
                  <note xml:id="bs3" pname="e" oct="4" dur="8"/>
                  <note xml:id="bs4" pname="f" oct="4" dur="8"/>
                  <beamSpan startid="#bs1" endid="#bs4" plist="#bs1 #bs3 #bs4"/>
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
    expect(notes.length).toBe(4);
    expect(notes[0]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("begin");
    expect(notes[1]?.querySelector(':scope > beam[number="1"]')).toBeNull();
    expect(notes[2]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("continue");
    expect(notes[3]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("end");
  });

  it("imports MEI harm as MusicXML harmony (root/bass/kind/degrees)", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" label="Lead" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="4"/>
                  <note pname="d" oct="4" dur="4"/>
                  <harm tstamp="2">C7#11b9/G</harm>
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
    const harmony = outDoc.querySelector("part > measure > harmony");
    expect(harmony).not.toBeNull();
    expect(harmony?.querySelector(":scope > root > root-step")?.textContent?.trim()).toBe("C");
    expect(harmony?.querySelector(":scope > kind")?.textContent?.trim()).toBe("other");
    expect(harmony?.querySelector(":scope > kind")?.getAttribute("text")).toBe("7#11b9");
    expect(harmony?.querySelector(":scope > bass > bass-step")?.textContent?.trim()).toBe("G");
    const d1 = harmony?.querySelector(":scope > degree:nth-of-type(1) > degree-value")?.textContent?.trim();
    const a1 = harmony?.querySelector(":scope > degree:nth-of-type(1) > degree-alter")?.textContent?.trim();
    const d2 = harmony?.querySelector(":scope > degree:nth-of-type(2) > degree-value")?.textContent?.trim();
    const a2 = harmony?.querySelector(":scope > degree:nth-of-type(2) > degree-alter")?.textContent?.trim();
    expect([`${d1}:${a1}`, `${d2}:${a2}`].sort()).toEqual(["11:1", "9:-1"]);
    expect(harmony?.querySelector(":scope > offset")?.textContent?.trim()).toBe("480");
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

  it("roundtrips harmony as MEI <harm> with degree alterations", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <harmony>
        <root><root-step>C</root-step></root>
        <kind text="7#11b9">other</kind>
        <bass><bass-step>G</bass-step></bass>
        <degree><degree-value>11</degree-value><degree-alter>1</degree-alter><degree-type>add</degree-type></degree>
        <degree><degree-value>9</degree-value><degree-alter>-1</degree-alter><degree-type>add</degree-type></degree>
        <offset>480</offset>
        <staff>1</staff>
      </harmony>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain("<harm");
    expect(mei).toContain("C7#11b9/G");
    expect(mei).toContain('tstamp="2"');

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const harmony = outDoc.querySelector("part > measure > harmony");
    expect(harmony).not.toBeNull();
    expect(harmony?.querySelector(":scope > root > root-step")?.textContent?.trim()).toBe("C");
    expect(harmony?.querySelector(":scope > bass > bass-step")?.textContent?.trim()).toBe("G");
    const d1 = harmony?.querySelector(":scope > degree:nth-of-type(1) > degree-value")?.textContent?.trim();
    const a1 = harmony?.querySelector(":scope > degree:nth-of-type(1) > degree-alter")?.textContent?.trim();
    const d2 = harmony?.querySelector(":scope > degree:nth-of-type(2) > degree-value")?.textContent?.trim();
    const a2 = harmony?.querySelector(":scope > degree:nth-of-type(2) > degree-alter")?.textContent?.trim();
    expect([`${d1}:${a1}`, `${d2}:${a2}`].sort()).toEqual(["11:1", "9:-1"]);
  });

  it("exports MusicXML dynamics/wedge directions to MEI dynam/hairpin and roundtrips", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction placement="below">
        <direction-type><dynamics><mf/></dynamics></direction-type>
        <offset>480</offset>
        <staff>1</staff>
      </direction>
      <direction placement="below">
        <direction-type><wedge type="crescendo" number="1"/></direction-type>
        <offset>0</offset>
        <staff>1</staff>
      </direction>
      <direction placement="below">
        <direction-type><wedge type="stop" number="1"/></direction-type>
        <offset>480</offset>
        <staff>1</staff>
      </direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain("<dynam");
    expect(mei).toContain(">mf</dynam>");
    expect(mei).toContain("<hairpin");
    expect(mei).toContain('form="cres"');
    expect(mei).toContain('tstamp="1"');
    expect(mei).toContain('tstamp2="2"');

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > mf")).not.toBeNull();
    expect(outDoc.querySelector('part > measure > direction > direction-type > wedge[type="crescendo"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure > direction > direction-type > wedge[type="stop"]')).not.toBeNull();
  });

  it("exports MusicXML pedal/octave-shift directions to MEI pedal/octave and roundtrips", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction placement="below">
        <direction-type><pedal type="start" number="1" line="yes"/></direction-type>
        <offset>0</offset><staff>1</staff>
      </direction>
      <direction placement="below">
        <direction-type><pedal type="stop" number="1" line="yes"/></direction-type>
        <offset>480</offset><staff>1</staff>
      </direction>
      <direction placement="above">
        <direction-type><octave-shift type="up" size="8" number="1"/></direction-type>
        <offset>0</offset><staff>1</staff>
      </direction>
      <direction placement="above">
        <direction-type><octave-shift type="stop" size="8" number="1"/></direction-type>
        <offset>480</offset><staff>1</staff>
      </direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain("<pedal");
    expect(mei).toContain('tstamp="1"');
    expect(mei).toContain('tstamp2="2"');
    expect(mei).toContain("<octave");
    expect(mei).toContain('dis="8"');
    expect(mei).toContain('dis.place="above"');

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('part > measure > direction > direction-type > pedal[type="start"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure > direction > direction-type > pedal[type="stop"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure > direction > direction-type > octave-shift[type="up"][size="8"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure > direction > direction-type > octave-shift[type="stop"][size="8"]')).not.toBeNull();
  });

  it("exports MusicXML segno/coda/fine directions to MEI repeatMark and roundtrips", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction><direction-type><segno/></direction-type><staff>1</staff></direction>
      <direction><direction-type><coda/></direction-type><offset>480</offset><staff>1</staff></direction>
      <direction><direction-type><words>Fine</words></direction-type><offset>960</offset><staff>1</staff></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain("<repeatMark");
    expect(mei).toContain(">segno</repeatMark>");
    expect(mei).toContain(">coda</repeatMark>");
    expect(mei).toContain(">Fine</repeatMark>");

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > segno")).not.toBeNull();
    expect(outDoc.querySelector("part > measure > direction > direction-type > coda")).not.toBeNull();
    const words = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > words"))
      .map((node) => (node.textContent || "").trim().toLowerCase());
    expect(words.includes("fine")).toBe(true);
  });

  it("exports MusicXML note glissando/slide notations to MEI gliss/slide and roundtrips", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><glissando type="start" number="1"/></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><glissando type="stop" number="1"/><slide type="start" number="2"/></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><slide type="stop" number="2"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain("<gliss ");
    expect(mei).toContain("<slide ");
    expect(mei).toContain('tstamp="1"');
    expect(mei).toContain('tstamp2="2"');
    expect(mei).toContain('tstamp2="3"');

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('part > measure > note:nth-of-type(1) > notations > glissando[type="start"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure > note:nth-of-type(2) > notations > glissando[type="stop"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure > note:nth-of-type(2) > notations > slide[type="start"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure > note:nth-of-type(3) > notations > slide[type="stop"]')).not.toBeNull();
  });

  it("exports MusicXML ornaments/fermata/breath/caesura to MEI control events and roundtrips", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><trill-mark/></ornaments></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><inverted-turn/></ornaments><fermata type="inverted"/></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><mordent/></ornaments><articulations><breath-mark/><caesura/></articulations></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain("<trill ");
    expect(mei).toContain("<turn ");
    expect(mei).toContain("<mordent ");
    expect(mei).toContain("<fermata ");
    expect(mei).toContain("<breath ");
    expect(mei).toContain("<caesura ");

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > note:nth-of-type(1) > notations > ornaments > trill-mark")).not.toBeNull();
    expect(outDoc.querySelector("part > measure > note:nth-of-type(2) > notations > ornaments > inverted-turn")).not.toBeNull();
    expect(outDoc.querySelector("part > measure > note:nth-of-type(2) > notations > fermata[type=\"inverted\"]")).not.toBeNull();
    expect(outDoc.querySelector("part > measure > note:nth-of-type(3) > notations > ornaments > mordent")).not.toBeNull();
    expect(outDoc.querySelector("part > measure > note:nth-of-type(3) > notations > articulations > breath-mark")).not.toBeNull();
    expect(outDoc.querySelector("part > measure > note:nth-of-type(3) > notations > articulations > caesura")).not.toBeNull();
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

  it("can fail on overfull note drop in strict mode", () => {
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
    expect(() => convertMeiToMusicXml(mei, { failOnOverfullDrop: true })).toThrow(
      /overfull would drop events/i
    );
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

  it("roundtrips tie/slur from MusicXML note notation into MEI @tie/@slur and back", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <tie type="start"/>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><tied type="start"/><slur type="start" number="1"/></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <tie type="stop"/>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><tied type="stop"/><slur type="stop" number="1"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain('tie="i"');
    expect(mei).toContain('tie="t"');
    expect(mei).toContain('slur="i1"');
    expect(mei).toContain('slur="t1"');
    expect(mei).toContain("<tie ");
    expect(mei).toContain('tstamp="1"');
    expect(mei).toContain('tstamp2="2"');
    expect(mei).toContain("<slur ");

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(':scope > tie[type="start"]')).not.toBeNull();
    expect(first?.querySelector(':scope > notations > slur[type="start"][number="1"]')).not.toBeNull();
    expect(second?.querySelector(':scope > tie[type="stop"]')).not.toBeNull();
    expect(second?.querySelector(':scope > notations > slur[type="stop"][number="1"]')).not.toBeNull();
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
    expect(notes[0]?.querySelector(":scope > pitch > alter")).toBeNull();
    expect(notes[1]?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("1");
    expect(notes[2]?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("-1");
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
    expect(mei.includes('grace="acc"') || mei.includes("<graceGrp")).toBe(true);

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(":scope > grace")).not.toBeNull();
    expect(second?.querySelector(":scope > duration")?.textContent?.trim()).toBe("480");
  });

  it("exports consecutive grace notes as MEI graceGrp and roundtrips both grace notes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><grace slash="yes"/><pitch><step>C</step><octave>5</octave></pitch><voice>1</voice><type>16th</type></note>
      <note><grace/><pitch><step>D</step><octave>5</octave></pitch><voice>1</voice><type>16th</type></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>960</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain("<graceGrp");
    expect(mei).toContain('slash="yes"');
    expect(mei).not.toContain('grace="acc"');

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes.length).toBeGreaterThanOrEqual(3);
    expect(notes[0]?.querySelector(":scope > grace")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > grace")).not.toBeNull();
    expect(notes[2]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("960");
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

  it("preserves non-standard duration ticks via mks-dur-ticks metadata", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>69</duration><voice>1</voice><type>16th</type></note>
      <note><rest/><duration>891</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    expect(mei).toContain('mks-dur-ticks="69"');
    expect(mei).toContain('mks-dur-ticks="891"');

    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > note:nth-of-type(1) > duration")?.textContent?.trim()).toBe("69");
    expect(outDoc.querySelector("part > measure > note:nth-of-type(2) > duration")?.textContent?.trim()).toBe("891");
    expect(outDoc.querySelector("part > measure > note:nth-of-type(1) > pitch > alter")?.textContent?.trim()).toBe("1");
  });

  it("does not clamp away notes when later measure capacity is larger (time change)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><rest/><duration>960</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="2">
      <attributes><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mei = exportMusicXmlDomToMei(srcDoc);
    const roundtripXml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const measure2Notes = outDoc.querySelectorAll("part > measure:nth-of-type(2) > note > pitch > step");
    expect(measure2Notes.length).toBe(4);
    expect(
      outDoc.querySelector(
        'part > measure:nth-of-type(2) > attributes > miscellaneous > miscellaneous-field[name="diag:0001"]'
      )
    ).toBeNull();
  });

  it("imports external-style MEI pitch/timing from dur/dots/chord without mks metadata", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp>
              <staffDef n="1" label="Staff 1" lines="5" clef.shape="G" clef.line="2"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="4"/>
                  <rest dur="8"/>
                  <note pname="d" oct="4" dur="8" dots="1"/>
                  <chord dur="4">
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
    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes.length).toBe(5);

    expect(notes[0]?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("C");
    expect(notes[0]?.querySelector(":scope > pitch > octave")?.textContent?.trim()).toBe("4");
    expect(notes[0]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("480");

    expect(notes[1]?.querySelector(":scope > rest")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("240");

    expect(notes[2]?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("D");
    expect(notes[2]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("360");
    expect(notes[2]?.querySelectorAll(":scope > dot").length).toBe(1);

    expect(notes[3]?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("E");
    expect(notes[3]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("480");
    expect(notes[3]?.querySelector(":scope > chord")).toBeNull();

    expect(notes[4]?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("G");
    expect(notes[4]?.querySelector(":scope > chord")).not.toBeNull();
    expect(notes[4]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("480");
  });

  it("imports MEI mRest/mSpace/space as timing-preserving rests", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="3" meter.unit="4">
            <staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <mRest/>
                </layer>
              </staff>
            </measure>
            <measure n="2">
              <staff n="1">
                <layer n="1">
                  <mSpace/>
                </layer>
              </staff>
            </measure>
            <measure n="3">
              <staff n="1">
                <layer n="1">
                  <space dur="4"/>
                  <space dur="2"/>
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

    const m1n1 = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(1)');
    const m2n1 = outDoc.querySelector('part > measure[number="2"] > note:nth-of-type(1)');
    expect(m1n1?.querySelector(":scope > rest")).not.toBeNull();
    expect(m2n1?.querySelector(":scope > rest")).not.toBeNull();
    expect(Number(m1n1?.querySelector(":scope > duration")?.textContent || "0")).toBe(1440);
    expect(Number(m2n1?.querySelector(":scope > duration")?.textContent || "0")).toBe(1440);
    expect(m1n1?.querySelector(":scope > type")?.textContent?.trim()).toBe("half");
    expect(m1n1?.querySelectorAll(":scope > dot").length).toBe(1);
    expect(m2n1?.querySelector(":scope > type")?.textContent?.trim()).toBe("half");
    expect(m2n1?.querySelectorAll(":scope > dot").length).toBe(1);

    const m3Durations = Array.from(outDoc.querySelectorAll('part > measure[number="3"] > note > duration')).map((n) =>
      Number(n.textContent || "0")
    );
    expect(m3Durations).toEqual([480, 960]);
  });

  it("imports official MEI fixture (CMN Listing 132 excerpt) with grace pitch/timing semantics", () => {
    const mei = readFileSync(
      resolve(process.cwd(), "tests/fixtures-local/mei-official/beam-grace/source-listing-132-snippet.mei"),
      "utf8"
    );

    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes.length).toBe(6);

    const stepOct = notes.map((n) => {
      const step = n.querySelector(":scope > pitch > step")?.textContent?.trim() ?? "";
      const octave = n.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "";
      return `${step}${octave}`;
    });
    expect(stepOct).toEqual(["D5", "E5", "D5", "C5", "D5", "B4"]);

    const graceIndexes = notes
      .map((n, i) => (n.querySelector(":scope > grace") ? i : -1))
      .filter((i) => i >= 0);
    expect(graceIndexes).toEqual([1, 3]);

    expect(notes[0].querySelector(":scope > duration")?.textContent?.trim()).toBe("240");
    expect(notes[2].querySelector(":scope > duration")?.textContent?.trim()).toBe("240");
    expect(notes[4].querySelector(":scope > duration")?.textContent?.trim()).toBe("240");
    expect(notes[5].querySelector(":scope > duration")?.textContent?.trim()).toBe("240");
    expect(notes[1].querySelector(":scope > duration")).toBeNull();
    expect(notes[3].querySelector(":scope > duration")).toBeNull();

    expect(notes[3].querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("1");
    expect(notes[0].querySelector(":scope > stem")?.textContent?.trim()).toBe("down");
    expect(notes[1].querySelector(":scope > stem")?.textContent?.trim()).toBe("up");
    expect(notes[3].querySelector(":scope > stem")?.textContent?.trim()).toBe("up");
    expect(notes[1].querySelector(":scope > grace")?.getAttribute("slash")).toBe("yes");
    expect(notes[3].querySelector(":scope > grace")?.getAttribute("slash")).toBe("yes");
    expect(notes[0].querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("begin");
    expect(notes[1].querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("continue");
    expect(notes[2].querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("continue");
    expect(notes[3].querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("continue");
    expect(notes[4].querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("continue");
    expect(notes[5].querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("end");
  });

  it("imports official MEI fixture (CMN Listing 142 excerpt) with breaksec secondary-beam split semantics", () => {
    const mei = readFileSync(
      resolve(process.cwd(), "tests/fixtures-local/mei-official/beam-secondary/source-listing-142-snippet.mei"),
      "utf8"
    );

    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes.length).toBe(9);

    const typeSeq = notes.map((n) => n.querySelector(":scope > type")?.textContent?.trim());
    expect(typeSeq).toEqual(["eighth", "16th", "32nd", "32nd", "16th", "32nd", "32nd", "32nd", "32nd"]);

    // Primary beam remains continuous inside each explicit MEI <beam> container.
    expect(notes[2].querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("begin");
    expect(notes[8].querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("end");

    // breaksec="1" on the 16th note splits secondary beam after that note.
    expect(notes[2].querySelector(':scope > beam[number="2"]')?.textContent?.trim()).toBe("begin");
    expect(notes[3].querySelector(':scope > beam[number="2"]')?.textContent?.trim()).toBe("continue");
    expect(notes[4].querySelector(':scope > beam[number="2"]')?.textContent?.trim()).toBe("end");
    expect(notes[5].querySelector(':scope > beam[number="2"]')?.textContent?.trim()).toBe("begin");
    expect(notes[8].querySelector(':scope > beam[number="2"]')?.textContent?.trim()).toBe("end");

    // Third-level beam naturally breaks at the 16th note and resumes on following 32nds.
    expect(notes[2].querySelector(':scope > beam[number="3"]')?.textContent?.trim()).toBe("begin");
    expect(notes[3].querySelector(':scope > beam[number="3"]')?.textContent?.trim()).toBe("end");
    expect(notes[5].querySelector(':scope > beam[number="3"]')?.textContent?.trim()).toBe("begin");
    expect(notes[8].querySelector(':scope > beam[number="3"]')?.textContent?.trim()).toBe("end");
  });

  it("imports Bach Brandenburg fixture and preserves first-measure key signature from keysig", () => {
    const mei = readFileSync(
      resolve(process.cwd(), "tests", "fixtures-local", "Bach-JS_BrandenburgConcert_No4_I_BWV1049.mei"),
      "utf-8"
    );
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const keyFifthsNodes = Array.from(
      outDoc.querySelectorAll('score-partwise > part > measure[number="1"] > attributes > key > fifths')
    );
    expect(keyFifthsNodes.length).toBeGreaterThan(0);
    for (const node of keyFifthsNodes) {
      expect(node.textContent?.trim()).toBe("1");
    }
  }, 15000);

  it("imports Bach Brandenburg fixture and keeps viola clef as C3 on part 6", () => {
    const mei = readFileSync(
      resolve(process.cwd(), "tests", "fixtures-local", "Bach-JS_BrandenburgConcert_No4_I_BWV1049.mei"),
      "utf-8"
    );
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const part6Measure1 = outDoc.querySelector('score-partwise > part[id="P6"] > measure[number="1"]');
    expect(part6Measure1).not.toBeNull();
    if (!part6Measure1) return;
    expect(part6Measure1.querySelector(":scope > attributes > clef > sign")?.textContent?.trim()).toBe("C");
    expect(part6Measure1.querySelector(":scope > attributes > clef > line")?.textContent?.trim()).toBe("3");
  }, 15000);

  it("imports beamSpan minimal fixture and keeps beam continuity on listed notes", () => {
    const mei = readFileSync(
      resolve(process.cwd(), "tests/fixtures-local/mei-official/beamspan-min/source-listing-147-inspired.mei"),
      "utf8"
    );
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const m1n1 = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(1)');
    const m1n2 = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(2)');
    const m1n3 = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(3)');
    const m1n4 = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(4)');
    expect(m1n1?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("begin");
    expect(m1n2?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("continue");
    expect(m1n3?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("continue");
    expect(m1n4?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("end");
  });

  it("imports tie-crossbar minimal fixture and keeps tie start/stop across measures", () => {
    const mei = readFileSync(
      resolve(process.cwd(), "tests/fixtures-local/mei-official/tie-crossbar-min/source-listing-148-inspired.mei"),
      "utf8"
    );
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const m1 = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(1)');
    const m2 = outDoc.querySelector('part > measure[number="2"] > note:nth-of-type(1)');
    expect(m1?.querySelector(':scope > tie[type="start"]')).not.toBeNull();
    expect(m1?.querySelector(':scope > notations > tied[type="start"]')).not.toBeNull();
    expect(m2?.querySelector(':scope > tie[type="stop"]')).not.toBeNull();
    expect(m2?.querySelector(':scope > notations > tied[type="stop"]')).not.toBeNull();
  });

  it("imports slur minimal fixture and maps i/m/t slur markers", () => {
    const mei = readFileSync(
      resolve(process.cwd(), "tests/fixtures-local/mei-official/slur-min/source-listing-152-inspired.mei"),
      "utf8"
    );
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const n1 = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(1)');
    const n2 = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(2)');
    const n3 = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(3)');
    expect(n1?.querySelector(':scope > notations > slur[type="start"][number="1"]')).not.toBeNull();
    expect(n2?.querySelector(':scope > notations > slur[type="start"][number="1"]')).not.toBeNull();
    expect(n2?.querySelector(':scope > notations > slur[type="stop"][number="1"]')).not.toBeNull();
    expect(n3?.querySelector(':scope > notations > slur[type="stop"][number="1"]')).not.toBeNull();
  });

  it("imports hairpin minimal fixture and maps startid/endid to wedge start/stop", () => {
    const mei = readFileSync(
      resolve(process.cwd(), "tests/fixtures-local/mei-official/hairpin-min/source-hairpin-inspired.mei"),
      "utf8"
    );
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const directions = Array.from(outDoc.querySelectorAll('part > measure[number="1"] > direction'));
    const start = directions.find((d) => d.querySelector(':scope > direction-type > wedge[type="crescendo"]'));
    const stop = directions.find((d) => d.querySelector(':scope > direction-type > wedge[type="stop"]'));
    expect(start).toBeTruthy();
    expect(stop).toBeTruthy();
  });

  it("resolves staff-level control-event ids across layers by tick (hairpin startid/endid)", () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <hairpin form="cres" startid="#n1" endid="#n4"/>
                <layer n="1">
                  <note xml:id="n1" pname="c" oct="4" dur="4"/>
                  <note xml:id="n2" pname="d" oct="4" dur="4"/>
                </layer>
                <layer n="2">
                  <note xml:id="n3" pname="e" oct="4" dur="4"/>
                  <note xml:id="n4" pname="f" oct="4" dur="4"/>
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

    const dirs = Array.from(outDoc.querySelectorAll('part > measure[number="1"] > direction'));
    const start = dirs.find((d) => d.querySelector(':scope > direction-type > wedge[type="crescendo"]'));
    const stop = dirs.find((d) => d.querySelector(':scope > direction-type > wedge[type="stop"]'));
    expect(start).toBeTruthy();
    expect(stop).toBeTruthy();
    expect(stop?.querySelector(":scope > offset")?.textContent?.trim()).toBe("480");
  });

  it("imports dynam minimal fixture and maps MEI dynam text to MusicXML dynamics mark", () => {
    const mei = readFileSync(
      resolve(process.cwd(), "tests/fixtures-local/mei-official/dynam-min/source-dynam-inspired.mei"),
      "utf8"
    );
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const dynamics = outDoc.querySelector("part > measure:nth-of-type(1) > direction > direction-type > dynamics > mf");
    expect(dynamics).not.toBeNull();
  });

  it("imports tuplet minimal fixture and keeps 3:2 time-modification on notes", () => {
    const mei = readFileSync(
      resolve(process.cwd(), "tests/fixtures-local/mei-official/tuplet-min/source-tuplet-inspired.mei"),
      "utf8"
    );
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const notes = Array.from(outDoc.querySelectorAll('part > measure[number="1"] > note')).slice(0, 3);
    expect(notes.length).toBe(3);
    for (const n of notes) {
      expect(n.querySelector(":scope > time-modification > actual-notes")?.textContent?.trim()).toBe("3");
      expect(n.querySelector(":scope > time-modification > normal-notes")?.textContent?.trim()).toBe("2");
    }
  });

  it("imports fermata minimal fixture and maps to MusicXML fermata notation", () => {
    const mei = readFileSync(
      resolve(process.cwd(), "tests/fixtures-local/mei-official/fermata-min/source-fermata-inspired.mei"),
      "utf8"
    );
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const third = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(3)');
    expect(third?.querySelector(":scope > notations > fermata")).not.toBeNull();
  });

  it("imports gliss minimal fixture and maps to MusicXML glissando start/stop", () => {
    const mei = readFileSync(
      resolve(process.cwd(), "tests/fixtures-local/mei-official/gliss-min/source-gliss-inspired.mei"),
      "utf8"
    );
    const xml = convertMeiToMusicXml(mei);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const first = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(1)');
    const fourth = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(4)');
    expect(first?.querySelector(':scope > notations > glissando[type="start"]')).not.toBeNull();
    expect(fourth?.querySelector(':scope > notations > glissando[type="stop"]')).not.toBeNull();
  });
});
