require("dotenv").config();
const express = require("express");
const cors = require("cors");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();
const axios = require("axios");
const xml2js = require("xml2js");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// 한글 종목 검색 (한국예탁결제원 API)
app.get("/api/search/kr/:query", async (req, res) => {
  try {
    const apiKey = process.env.KSD_API_KEY;
    const url = `https://apis.data.go.kr/B552481/StockSvc/getStkIsinByNmN1`;
    const result = await axios.get(url, {
      params: {
        serviceKey: apiKey,
        pageNo: 1,
        numOfRows: 100,
        secnNm: req.params.query,
      },
    });

    // XML → JSON 변환
    const parsed = await xml2js.parseStringPromise(result.data, {
      explicitArray: false,
    });

    // 종목 목록 추출
    const items = parsed.response.body.items.item;
    const list = Array.isArray(items) ? items : [items];

    const stocks = list
      .filter((item) => {
        const nm = item.korSecnNm;
        return (
          !nm.includes("(") &&
          !nm.includes(")") &&
          !nm.includes("[") &&
          !nm.includes("]") &&
          !nm.includes("KODEX")
        );
      })
      .map((item) => ({
        isin: item.isin,
        shotnIsin: item.shotnIsin,
        korSecnNm: item.korSecnNm,
        engSecnNm: item.engSecnNm,
      }));

    res.json(stocks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 영문 종목 검색 (Yahoo Finance)
app.get("/api/search/:query", async (req, res) => {
  try {
    const result = await yahooFinance.search(req.params.query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 주식 현재가
app.get("/api/quote/:symbol", async (req, res) => {
  try {
    const result = await yahooFinance.quote(req.params.symbol);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ETF 목록 조회
app.get("/api/etf/list/:csno", async (req, res) => {
  const client = await pool.connect();
  try {
    const { csno } = req.params;

    const result = await client.query(
      `SELECT 
        e.CSNO, e.SEQ, e.ETF_REF_NO, e.STATUS, e.REG_SYS_DATE,
        h.HIST_SEQ,
        h.ETF_NAME_1, h.ETF_PRICE_1, h.ETF_RATIO_1,
        h.ETF_NAME_2, h.ETF_PRICE_2, h.ETF_RATIO_2,
        h.ETF_NAME_3, h.ETF_PRICE_3, h.ETF_RATIO_3,
        h.ETF_NAME_4, h.ETF_PRICE_4, h.ETF_RATIO_4,
        h.ETF_NAME_5, h.ETF_PRICE_5, h.ETF_RATIO_5,
        h.ETF_NAME_6, h.ETF_PRICE_6, h.ETF_RATIO_6,
        h.ETF_NAME_7, h.ETF_PRICE_7, h.ETF_RATIO_7,
        h.ETF_NAME_8, h.ETF_PRICE_8, h.ETF_RATIO_8,
        h.ETF_NAME_9, h.ETF_PRICE_9, h.ETF_RATIO_9,
        h.ETF_NAME_10, h.ETF_PRICE_10, h.ETF_RATIO_10
      FROM TB_INFO_ETF e
      JOIN TB_INFO_ETF_HIST h 
        ON e.CSNO = h.CSNO AND e.SEQ = h.SEQ
      WHERE e.CSNO = $1
        AND e.STATUS = 'NOR'
        AND h.HIST_SEQ = (
          SELECT MAX(HIST_SEQ) 
          FROM TB_INFO_ETF_HIST 
          WHERE CSNO = e.CSNO AND SEQ = e.SEQ
        )
      ORDER BY e.SEQ DESC`,
      [csno],
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`서버 실행중 : http://localhost:${PORT}`);
});

// ETF 등록 API

app.post("/api/etf/register", async (req, res) => {
  const client = await pool.connect();
  try {
    const { csno, etfRefNo, stocks } = req.body;

    await client.query("BEGIN");

    // SEQ 채번
    const seqResult = await client.query(
      `SELECT COALESCE(MAX(SEQ), 0) + 1 AS next_seq 
       FROM TB_INFO_ETF WHERE CSNO = $1`,
      [csno],
    );
    const seq = seqResult.rows[0].next_seq;

    // TB_INFO_ETF INSERT
    await client.query(
      `INSERT INTO TB_INFO_ETF 
       (CSNO, SEQ, ETF_REF_NO, STATUS, REG_SYS_DATE, MOD_SYS_DATE)
       VALUES ($1, $2, $3, 'NOR', NOW(), NOW())`,
      [csno, seq, etfRefNo],
    );

    // TB_INFO_ETF_HIST INSERT (주가 포함)
    const columns = ["CSNO", "SEQ", "HIST_SEQ", "STATUS"];
    const params = [csno, seq, 1, "NOR"];

    stocks.forEach((stock, i) => {
      columns.push(`ETF_NAME_${i + 1}`);
      columns.push(`ETF_CODE_${i + 1}`);
      columns.push(`ETF_PRICE_${i + 1}`);
      columns.push(`ETF_RATIO_${i + 1}`);
      params.push(stock.korSecnNm);
      params.push(stock.shotnIsin); // 종목코드 추가
      params.push(stock.currentPrice || 0);
      params.push(stock.ratio);
    });

    columns.push("REG_SYS_DATE", "MOD_SYS_DATE");
    params.push(new Date(), new Date());

    const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");

    await client.query(
      `INSERT INTO TB_INFO_ETF_HIST (${columns.join(", ")})
       VALUES (${placeholders})`,
      params,
    );

    await client.query("COMMIT");
    res.json({ success: true, seq });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// 수익률 계산 API
app.get("/api/etf/profit/:csno/:seq", async (req, res) => {
  const client = await pool.connect();
  try {
    const { csno, seq } = req.params;

    // DB에서 등록당시 정보 조회
    const result = await client.query(
      `SELECT * FROM TB_INFO_ETF_HIST
       WHERE CSNO = $1 AND SEQ = $2
       AND HIST_SEQ = (
         SELECT MAX(HIST_SEQ) FROM TB_INFO_ETF_HIST
         WHERE CSNO = $1 AND SEQ = $2
       )`,
      [csno, seq],
    );

    const hist = result.rows[0];
    let totalProfit = 0;
    const stocks = [];

    // 각 종목별 현재가 조회 및 수익률 계산
    for (let i = 1; i <= 10; i++) {
      const name = hist[`etf_name_${i}`];
      const code = hist[`etf_code_${i}`];
      const regPrice = parseFloat(hist[`etf_price_${i}`]);
      const ratio = parseFloat(hist[`etf_ratio_${i}`]);

      if (!name || !regPrice || !code) continue;

      try {
        // DB에서 market 정보도 가져와야 해요
        // 일단 종목코드로 구분 — 미국주식은 영문+숫자 혼합
        const isKorean = /^[0-9]+$/.test(code);
        const symbol = isKorean ? code + ".KS" : code;
        const priceRes = await yahooFinance.quote(symbol);
        const currentPrice = priceRes.regularMarketPrice;

        // 수익률 계산
        const profit = ((currentPrice - regPrice) / regPrice) * 100;
        const weightedProfit = profit * (ratio / 100);
        totalProfit += weightedProfit;

        stocks.push({
          name,
          code,
          regPrice,
          currentPrice,
          ratio,
          profit: parseFloat(profit.toFixed(2)),
          weightedProfit: parseFloat(weightedProfit.toFixed(2)),
        });
      } catch {
        continue;
      }
    }

    res.json({
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      stocks,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// 로그인/회원가입 API
app.post('/api/auth/login', async (req, res) => {
  const client = await pool.connect();
  try {
    const { email } = req.body;

    // 기존 회원 조회
    const result = await client.query(
      `SELECT CSNO FROM TB_CIF WHERE EMAIL = $1 AND STATUS = 'NOR'`,
      [email]
    );

    if (result.rows.length > 0) {
      // 기존 회원 → 로그인
      res.json({ 
        success: true, 
        csno: result.rows[0].csno,
        isNew: false
      });
    } else {
      // 신규 회원 → CSNO 채번 후 가입
      const seqResult = await client.query(
        `SELECT COALESCE(MAX(CSNO::integer), 0) + 1 AS next_csno FROM TB_CIF`
      );
      const newCsno = String(seqResult.rows[0].next_csno).padStart(10, '0');

      await client.query(
        `INSERT INTO TB_CIF (CSNO, EMAIL, STATUS, REG_SYS_DATE, MOD_SYS_DATE)
         VALUES ($1, $2, 'NOR', NOW(), NOW())`,
        [newCsno, email]
      );

      res.json({ 
        success: true, 
        csno: newCsno,
        isNew: true
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});
