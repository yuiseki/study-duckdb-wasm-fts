import { useEffect, useRef, useState } from "react";
import "./App.css";

import * as duckdb from "@duckdb/duckdb-wasm";
import duckdb_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?worker";
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import type { Table, StructRowProxy } from "apache-arrow";

const initLinderaTokenizer = async (
  setMyLinderaTokenizer: React.Dispatch<React.SetStateAction<any>>
) => {
  const { TokenizerBuilder } = await import("lindera-wasm");
  const builder = new TokenizerBuilder();
  builder.set_dictionary_kind("ipadic");
  builder.set_mode("normal");

  builder.append_character_filter("unicode_normalize", { kind: "nfkc" });

  builder.append_token_filter("lowercase", {});
  builder.append_token_filter("japanese_compound_word", {
    kind: "ipadic",
    tags: ["名詞,数"],
    new_tag: "名詞,数",
  });

  const tokenizer = builder.build();
  setMyLinderaTokenizer(tokenizer);
};

const initDuckDB = async (
  setMyDuckDB: React.Dispatch<React.SetStateAction<duckdb.AsyncDuckDB | null>>,
  tokenizer: any
) => {
  const worker = new duckdb_worker();
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(duckdb_wasm);
  await db.open({});

  const conn = await db.connect();
  await conn.query("LOAD fts;");
  await conn.query("INSTALL fts;");
  await conn.query("CREATE SEQUENCE IF NOT EXISTS id_sequence START 1;");
  await conn.query(
    "CREATE TABLE sora_doc (id INTEGER DEFAULT nextval('id_sequence') PRIMARY KEY, content VARCHAR, content_t VARCHAR);"
  );

  // https://sora-doc.shiguredo.jp/ より引用
  const docs = [
    "例えば 3 ノードのクラスターがある場合、 すでに接続しているクライアントがいるノードとは異なるノードにクライアントが接続した場合、Sora はその異なるノードにすでに接続しているクライアントの音声や映像、データをリレーします。",
    "StartRecording API やセッションウェブフックの戻り値で指定できる録画メタデータについてはセンシティブなデータとして扱っていません。これは録画ファイル出力時の録画メタデータファイルに含まれ、映像合成時に利用する事を想定しているためです。",
    "WebSocket は TCP ベースのため Head of Line Blocking が存在し、不安定な回線などでパケットが詰まってしまうことがあります。 DataChannel は WebSocket とは異なり、パケットを並列でやりとりできるため、不安定な回線などでもパケットが詰まることが少なくなります。 シグナリングを WebSocket 経由から DataChannel 経由へ切り替える機能を提供することでより安定した接続が維持できます。",
    "Sora はシグナリング経由で送られてきた情報や、 そのチャネルに接続している情報を HTTP/1.1 POST で sora.conf の auth_webhook_url に指定された URL へ送信します。 このとき送信する情報は JSON 形式です。",
    "クラスターで利用しているネットワークに障害が発生した際には、個々のノードはクラスターを構成する他のノードへの接続を試みて、復旧処理を行います。",
    "サイマルキャスト (Simulcast) は、配信時に 1 つの RTCPeerConnection から複数種類のエンコードした映像を配信する技術です。",
  ];

  for (const doc of docs) {
    const tokens = tokenizer
      .tokenize(doc)
      .map((token: Map<string, string>) => token.get("text"))
      .join(" ");
    const stmt = await conn.prepare(
      "INSERT INTO sora_doc (content, content_t) VALUES (?, ?)"
    );
    await stmt.query(doc, tokens);
    await stmt.close();
  }

  await conn.query(
    "PRAGMA create_fts_index(sora_doc, id, content_t, stemmer = 'none', stopwords = 'none', ignore = '', lower = false, strip_accents = false);"
  );
  setMyDuckDB(db);
};

function App() {
  const [query, setQuery] = useState("センシティブ");
  const linderaTokenizerInitialized = useRef(false);
  const [myLinderaTokenizer, setMyLinderaTokenizer] = useState<any>(null);
  const duckdbInitialized = useRef(false);
  const [myDuckDB, setMyDuckDB] = useState<duckdb.AsyncDuckDB | null>(null);
  const [resultRows, setResultRows] = useState<StructRowProxy<any>[]>([]);

  useEffect(() => {
    if (!linderaTokenizerInitialized.current) {
      initLinderaTokenizer(setMyLinderaTokenizer).then(() => {
        linderaTokenizerInitialized.current = true;
        console.log("Lindera Tokenizer initialized");
      });
    }
  }, []);

  useEffect(() => {
    if (!duckdbInitialized.current && myLinderaTokenizer) {
      initDuckDB(setMyDuckDB, myLinderaTokenizer).then(() => {
        duckdbInitialized.current = true;
        console.log("DuckDB initialized");
      });
    }
  }, [myLinderaTokenizer]);

  useEffect(() => {
    const doit = async () => {
      console.log(myDuckDB);
      console.log(myLinderaTokenizer);
      console.log(query);
      if (myDuckDB && myLinderaTokenizer && query) {
        console.log(query);

        const tokens = myLinderaTokenizer
          .tokenize(query)
          .map((token: Map<string, string>) => token.get("text"))
          .join(" ");
        const conn = await myDuckDB.connect();
        const sql: string = `SELECT id, fts_main_sora_doc.match_bm25(id, '${tokens}') AS score, content FROM sora_doc WHERE score IS NOT NULL ORDER BY score DESC`;
        const newResults: Table = await conn.query(sql);
        const newResultRows: StructRowProxy<any>[] = newResults
          .toArray()
          .map((row: any) => JSON.parse(row));

        setResultRows(newResultRows);
      }
    };
    void doit();
  }, [query, myDuckDB, myLinderaTokenizer]);

  return (
    <div>
      <h1>DuckDB WASM FTS with Lindera - Demo App</h1>
      <p>
        This app demonstrates the integration of DuckDB FTS and Lindera with
        React.
      </p>
      <div>
        <h2
          style={{
            textAlign: "left",
          }}
        >
          Query:
        </h2>
        <div style={{ display: "flex", alignItems: "left" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter your query"
          />
        </div>
      </div>
      <>
        {!duckdbInitialized.current || !linderaTokenizerInitialized.current ? (
          <div>
            <h2
              style={{
                textAlign: "left",
              }}
            >
              Initializing...
              <br />
              Lindera Tokenizer:{" "}
              {linderaTokenizerInitialized.current ? "OK" : "Loading..."}
              <br />
              DuckDB WASM: {duckdbInitialized.current ? "OK" : "Loading..."}
            </h2>
          </div>
        ) : null}
      </>
      <div>
        <h2
          style={{
            textAlign: "left",
          }}
        >
          Results:
        </h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            border: "1px solid #ddd",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              background: "#f5f5f5",
              fontWeight: "bold",
              padding: "10px 0",
              borderBottom: "1px solid #ddd",
            }}
          >
            <div style={{ flex: "0 0 50px", padding: "0 10px" }}>ID</div>
            <div style={{ flex: "0 0 100px", padding: "0 10px" }}>Score</div>
            <div style={{ flex: "1", padding: "0 10px" }}>Content</div>
          </div>
          {resultRows.map((row, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                padding: "10px 0",
                borderBottom:
                  index < resultRows.length - 1 ? "1px solid #eee" : "none",
              }}
            >
              <div style={{ flex: "0 0 50px", padding: "0 10px" }}>
                {row.id}
              </div>
              <div style={{ flex: "0 0 100px", padding: "0 10px" }}>
                {row.score.toFixed(4)}
              </div>
              <div style={{ flex: "1", padding: "0 10px", textAlign: "left" }}>
                {row.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
