import { useState } from "react";
import "./App.css";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";

interface Stock {
  isin: string;
  shotnIsin: string;
  korSecnNm: string;
  engSecnNm: string;
  currentPrice?: number;
  changePercent?: number;
  market?: "KR" | "US"; // 국가 정보 추가
}

interface EtfItem {
  stock: Stock;
  ratio: number;
}

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [etfPortfolio, setEtfPortfolio] = useState<EtfItem[]>([]);
  const [activeTab, setActiveTab] = useState<"KR" | "US">("KR");
  const [etfName, setEtfName] = useState("");
  const [myEtfList, setMyEtfList] = useState<any[]>([]);
  const [profitData, setProfitData] = useState<{ [key: string]: any }>({});
  const [csno, setCsno] = useState("");
  const [email, setEmail] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const COLORS = [
    "#e94560",
    "#0f3460",
    "#16213e",
    "#1a1a2e",
    "#533483",
    "#2b9348",
    "#aacc00",
    "#f77f00",
    "#d62828",
    "#023e8a",
  ];

  // 검색
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      let validStocks: Stock[] = [];

      if (activeTab === "KR") {
        // 한국주식 검색
        const response = await fetch(
          `http://localhost:4000/api/search/kr/${searchQuery}`,
        );
        const stocks: Stock[] = await response.json();

        const stocksWithPrice = await Promise.all(
          stocks.map(async (stock) => {
            try {
              const symbol = stock.shotnIsin + ".KS";
              const priceRes = await fetch(
                `http://localhost:4000/api/quote/${symbol}`,
              );
              const priceData = await priceRes.json();
              if (!priceData.regularMarketPrice) return null;
              return {
                ...stock,
                currentPrice: priceData.regularMarketPrice,
                changePercent: priceData.regularMarketChangePercent,
                market: "KR",
              };
            } catch {
              return null;
            }
          }),
        );
        validStocks = stocksWithPrice.filter(Boolean) as Stock[];
      } else {
        // 미국주식 검색
        const response = await fetch(
          `http://localhost:4000/api/search/${searchQuery}`,
        );
        const data = await response.json();
        const quotes = data.quotes || [];

        const stocksWithPrice = await Promise.all(
          quotes.map(async (item: any) => {
            try {
              const priceRes = await fetch(
                `http://localhost:4000/api/quote/${item.symbol}`,
              );
              const priceData = await priceRes.json();
              if (!priceData.regularMarketPrice) return null;
              return {
                isin: item.symbol,
                shotnIsin: item.symbol,
                korSecnNm: item.longname || item.shortname || item.symbol,
                engSecnNm: item.longname || "",
                currentPrice: priceData.regularMarketPrice,
                changePercent: priceData.regularMarketChangePercent,
                market: "US",
              };
            } catch {
              return null;
            }
          }),
        );
        validStocks = stocksWithPrice.filter(Boolean) as Stock[];
      }

      setSearchResults(validStocks);
    } catch (error) {
      console.error("검색 오류:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // 종목 클릭 → ETF 구성에 추가
  const handleAddToEtf = (stock: Stock) => {
    // 이미 추가된 종목인지 확인
    const exists = etfPortfolio.some(
      (item) => item.stock.shotnIsin === stock.shotnIsin,
    );
    if (exists) {
      alert("이미 추가된 종목이에요!");
      return;
    }
    // 최대 30개까지만 (10종목 이상 맞추기 위해)
    const newItem: EtfItem = { stock, ratio: 0 };
    setEtfPortfolio([...etfPortfolio, newItem]);
  };

  // 비율 변경
  const handleRatioChange = (index: number, value: string) => {
    const ratio = parseFloat(value) || 0;
    // 종목당 최대 30%
    if (ratio > 30) {
      alert("종목당 최대 30%까지 입력 가능해요!");
      return;
    }
    const updated = [...etfPortfolio];
    updated[index] = { ...updated[index], ratio };
    setEtfPortfolio(updated);
  };

  // 종목 삭제
  const handleRemove = (index: number) => {
    const updated = etfPortfolio.filter((_, i) => i !== index);
    setEtfPortfolio(updated);
  };

  // 전체 비율 합계
  const totalRatio = etfPortfolio.reduce((sum, item) => sum + item.ratio, 0);

  // ETF 등록 유효성 검사
  const handleRegister = async () => {
    if (etfPortfolio.length < 10) {
      alert(`최소 10종목 필요해요! (현재 ${etfPortfolio.length}종목)`);
      return;
    }
    if (totalRatio !== 100) {
      alert(`합계가 100%가 되어야 해요! (현재 ${totalRatio}%)`);
      return;
    }

    if (!etfName.trim()) {
      alert("ETF 이름을 입력해주세요!");
      return;
    }

    try {
      const response = await fetch("http://localhost:4000/api/etf/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csno: csno,
          etfRefNo: etfName, // 나중에 입력받도록 수정
          stocks: etfPortfolio.map((item) => ({
            korSecnNm: item.stock.korSecnNm,
            shotnIsin: item.stock.shotnIsin, // 추가
            currentPrice: item.stock.currentPrice,
            ratio: item.ratio,
          })),
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`ETF 등록 완료! (SEQ: ${data.seq})`);
      } else {
        alert(`등록 실패: ${data.error}`);
      }
    } catch (error) {
      console.error("등록 오류:", error);
      alert("서버 오류가 발생했어요!");
    }
  };

  const handleLoadMyEtf = async () => {
    try {
      const response = await fetch(
        `http://localhost:4000/api/etf/list/${csno}`,
      );
      const data = await response.json();
      setMyEtfList(data);
    } catch (error) {
      console.error("ETF 조회 오류:", error);
    }
  };

  const handleProfitCalc = async (csno: string, seq: number) => {
    try {
      const response = await fetch(
        `http://localhost:4000/api/etf/profit/${csno}/${seq}`,
      );
      const data = await response.json();
      setProfitData((prev) => ({ ...prev, [`${csno}_${seq}`]: data }));
    } catch (error) {
      console.error("수익률 계산 오류:", error);
    }
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      alert("이메일을 입력해주세요!");
      return;
    }
    try {
      const response = await fetch("http://localhost:4000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (data.success) {
        setCsno(data.csno);
        setIsLoggedIn(true);
        alert(
          data.isNew
            ? `가입 완료! CSNO: ${data.csno}`
            : `로그인 완료! CSNO: ${data.csno}`,
        );
      }
    } catch (error) {
      console.error("로그인 오류:", error);
    }
  };

  if (!isLoggedIn) {
    return (
      <div>
        <header>
          <h1>Tobby Job</h1>
          <h3>답답해서 내가 만드는 ETF</h3>
        </header>
        <main>
          <section>
            <h2>🔐 로그인</h2>
            <div className="search-box">
              <input
                type="email"
                placeholder="이메일 입력"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              <button onClick={handleLogin}>입장</button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div>
      <header>
        <h1>Tobby Job</h1>
        <h3>답답해서 내가 만드는 ETF</h3>
      </header>

      <main>
        {/* 검색 섹션 */}
        <section>
          <h2>🔍 검색</h2>
          {/* 탭 */}
          <div className="tab-box">
            <button
              className={activeTab === "KR" ? "tab active" : "tab"}
              onClick={() => {
                setActiveTab("KR");
                setSearchResults([]);
              }}
            >
              🇰🇷 국내
            </button>
            <button
              className={activeTab === "US" ? "tab active" : "tab"}
              onClick={() => {
                setActiveTab("US");
                setSearchResults([]);
              }}
            >
              🇺🇸 해외
            </button>
          </div>

          <div className="search-box">
            <input
              type="text"
              placeholder={
                activeTab === "KR"
                  ? "종목명 입력 (예: 삼성, 카카오)"
                  : "Search (예: Apple, NVIDIA)"
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button onClick={handleSearch}>🔍</button>
          </div>
          {loading && <p>검색중...</p>}
          <div className="search-results">
            {searchResults.map((stock, index) => (
              <div
                key={index}
                className="result-item"
                onClick={() => handleAddToEtf(stock)}
                style={{ cursor: "pointer" }}
              >
                <span className="symbol">{stock.shotnIsin}</span>
                <span className="name">{stock.korSecnNm}</span>
                <span className="price">
                  {stock.currentPrice
                    ? activeTab === "KR"
                      ? `${stock.currentPrice.toLocaleString()}원`
                      : `$${stock.currentPrice.toLocaleString()}`
                    : "-"}
                </span>
                <span
                  className={
                    stock.changePercent && stock.changePercent > 0
                      ? "up"
                      : "down"
                  }
                >
                  {stock.changePercent
                    ? `${stock.changePercent.toFixed(2)}%`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ETF 구성 섹션 */}
        <section>
          <h2>📊 내 ETF 구성</h2>
          {/* ETF 이름 입력 */}
          <div className="search-box" style={{ marginBottom: "15px" }}>
            <input
              type="text"
              placeholder="ETF 이름 입력 (예: 나만의 테크 ETF)"
              value={etfName}
              onChange={(e) => setEtfName(e.target.value)}
            />
          </div>

          <div className="etf-header">
            <span>종목수: {etfPortfolio.length} / 최소 10종목</span>
            <span className={totalRatio === 100 ? "ratio-ok" : "ratio-ng"}>
              합계: {totalRatio}% / 100%
            </span>
          </div>
          {etfPortfolio.map((item, index) => (
            <div key={index} className="etf-item">
              <span className="symbol">{item.stock.shotnIsin}</span>
              <span className="name">{item.stock.korSecnNm}</span>
              <span className="price">
                {item.stock.currentPrice
                  ? item.stock.market === "KR"
                    ? `${item.stock.currentPrice.toLocaleString()}원`
                    : `$${item.stock.currentPrice.toLocaleString()}`
                  : "-"}
              </span>
              <input
                type="number"
                min="0"
                max="30"
                value={item.ratio}
                onChange={(e) => handleRatioChange(index, e.target.value)}
                className="ratio-input"
              />
              <span>%</span>
              <button
                onClick={() => handleRemove(index)}
                className="remove-btn"
              >
                ✕
              </button>
            </div>
          ))}
          {etfPortfolio.length > 0 && (
            <button className="register-btn" onClick={handleRegister}>
              ETF 등록
            </button>
          )}
        </section>

        {/* 수익률 섹션 */}
        <section>
          <h2>📋 내가 만든 ETF 목록</h2>
          <button className="register-btn" onClick={handleLoadMyEtf}>
            내 ETF 불러오기
          </button>
          {myEtfList.map((etf, index) => (
            <div
              key={index}
              className="etf-card"
              onClick={() => handleProfitCalc(etf.csno, etf.seq)}
              style={{ cursor: "pointer" }}
            >
              <div className="etf-card-header">
                <span className="etf-card-name">{etf.etf_ref_no}</span>
                <span className="etf-card-date">
                  {new Date(etf.reg_sys_date).toLocaleDateString("ko-KR")}
                </span>
              </div>

              {/* 수익률 표시 */}
              {profitData[`${etf.csno}_${etf.seq}`] && (
                <div className="chart-container">
                  {/* 가로 바차트 - ETF 구성 비율 */}
                  <div className="chart-box">
                    <h4>📊 구성 비율</h4>
                    <BarChart
                      width={350}
                      height={300}
                      data={profitData[`${etf.csno}_${etf.seq}`].stocks.map(
                        (s: any) => ({
                          name:
                            s.name.length > 6
                              ? s.name.substring(0, 6) + ".."
                              : s.name,
                          비율: s.ratio,
                        }),
                      )}
                      layout="vertical"
                    >
                      <XAxis type="number" unit="%" />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={80}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip />
                      <Bar dataKey="비율" fill="#e94560" />
                    </BarChart>
                  </div>

                  {/* 바차트 - 종목별 수익률 */}
                  <div className="chart-box">
                    <h4>📈 종목별 수익률</h4>
                    <BarChart
                      width={400}
                      height={250}
                      data={profitData[`${etf.csno}_${etf.seq}`].stocks.map(
                        (s: any) => ({
                          name:
                            s.name.length > 5
                              ? s.name.substring(0, 5) + ".."
                              : s.name,
                          수익률: s.profit,
                        }),
                      )}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="수익률" fill="#e94560" />
                    </BarChart>
                  </div>
                </div>
              )}

              <div className="etf-card-stocks">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
                  (i) =>
                    etf[`etf_name_${i}`] && (
                      <span key={i} className="etf-card-stock">
                        {etf[`etf_name_${i}`]} {etf[`etf_ratio_${i}`]}%
                        {etf[`etf_price_${i}`]
                          ? ` / ${Number(etf[`etf_price_${i}`]).toLocaleString()}`
                          : ""}
                        {/* 종목별 수익률 */}
                        {profitData[`${etf.csno}_${etf.seq}`] &&
                          (() => {
                            const stockProfit = profitData[
                              `${etf.csno}_${etf.seq}`
                            ].stocks.find(
                              (s: any) => s.name === etf[`etf_name_${i}`],
                            );
                            return stockProfit ? (
                              <span
                                className={
                                  stockProfit.profit >= 0 ? "up" : "down"
                                }
                              >
                                {stockProfit.profit > 0 ? "+" : ""}
                                {stockProfit.profit}%
                              </span>
                            ) : null;
                          })()}
                      </span>
                    ),
                )}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

export default App;
