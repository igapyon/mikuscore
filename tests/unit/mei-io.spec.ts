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
});
