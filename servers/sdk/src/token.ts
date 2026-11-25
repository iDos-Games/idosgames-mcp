import { readFileSync } from "node:fs";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// Выпуск и торговля токенами игр С КОШЕЛЬКА ЧЕЛОВЕКА (решение владельца 25.11.2026, варианты B и C). Удалённый MCP
// платформы (site.idosgames.com/api/v2/mcp) проверяет черновик, бронирует адрес, подписывает условия и финализирует
// выпуск; здесь, на компьютере человека, транзакция собирается пакетом @idosgames/token (B: вернуть агенту) и
// подписывается локальным ключом (C: отправить). Ключ берётся только из переменных окружения, к нам не уходит и в
// ответах тулов не печатается. Потолков сумм нет: решает сам человек.
//
// Ключи:
//   IDOSGAMES_EVM_PRIVATE_KEY      0x… приватный ключ EVM (или IDOSGAMES_EVM_KEY_FILE: путь к файлу с ним)
//   IDOSGAMES_SOLANA_KEYPAIR       путь к файлу ключа Solana (JSON-массив байтов, как у solana-keygen)
//   IDOSGAMES_SOLANA_PRIVATE_KEY   тот же JSON-массив прямо в переменной
// Адреса (стенд): IDOSGAMES_SITE_API (по умолчанию https://site.idosgames.com/api),
//                 IDOSGAMES_ENGINE_API (по умолчанию https://api.idosgames.com/api).

type Result = { ok: true; value: unknown } | { ok: false; error: string };

const env = (k: string) => process.env[k]?.trim() || undefined;
const siteApi = () => env("IDOSGAMES_SITE_API");
const engineApi = () => env("IDOSGAMES_ENGINE_API");

const writes = (title: string): Tool["annotations"] => ({
  title,
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
});
const reads = (title: string): Tool["annotations"] => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
});

const TRADE_PROPS = {
  game_id: { type: "string", description: "TitleID of the game whose token to trade." },
  side: { type: "string", enum: ["buy", "sell"] },
  amount: {
    type: "string",
    description: 'Decimal amount: buy = pair currency to spend (e.g. "0.05"), sell = tokens to sell.',
  },
  slippage_percent: { type: "number", description: "Max slippage, percent (default 5)." },
} as const;

const LAUNCH_PROP = {
  launch: {
    type: "object",
    description: "The whole answer of the platform MCP tool build_token_launch_tx (Transaction/Approvals or SolanaLaunch).",
  },
} as const;

export const TOKEN_TOOLS: Tool[] = [
  {
    name: "get_local_wallet",
    title: "Local wallet addresses",
    annotations: reads("Local wallet addresses"),
    description:
      "Addresses of the wallets this local MCP can sign with (from IDOSGAMES_EVM_PRIVATE_KEY / IDOSGAMES_SOLANA_KEYPAIR). " +
      "Pass one as 'wallet' to the platform MCP tool build_token_launch_tx. Keys are never returned.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "build_launch_tx",
    title: "Build a token launch transaction",
    annotations: reads("Build a token launch transaction"),
    description:
      "Turn the answer of the platform MCP tool build_token_launch_tx into unsigned transactions for YOUR wallet: EVM calls " +
      "(approvals, then the launch) or a base64 Solana transaction. Sign and send them yourself, then call the platform " +
      "MCP tool submit_launch_tx with the hash/signature.",
    inputSchema: { type: "object", properties: LAUNCH_PROP, required: ["launch"] },
  },
  {
    name: "send_launch_tx",
    title: "Sign and send a token launch",
    annotations: writes("Sign and send a token launch"),
    description:
      "Sign the launch from build_token_launch_tx with the local key and send it (spends the creation fee and the optional " +
      "first buy from that wallet). The wallet must be the one passed to build_token_launch_tx. Returns the hash/signature: " +
      "then call the platform MCP tool submit_launch_tx with it.",
    inputSchema: { type: "object", properties: LAUNCH_PROP, required: ["launch"] },
  },
  {
    name: "quote_token_trade",
    title: "Quote a token trade",
    annotations: reads("Quote a token trade"),
    description:
      "Live quote for buying or selling a game's token (new stack: EVM Uniswap V4 or Solana): what you receive and the " +
      "minimum after slippage. Read-only.",
    inputSchema: { type: "object", properties: TRADE_PROPS, required: ["game_id", "side", "amount"] },
  },
  {
    name: "build_token_trade",
    title: "Build a token trade",
    annotations: reads("Build a token trade"),
    description:
      "Unsigned trade for a wallet you control: EVM calls (approvals, then the swap) or a base64 Solana transaction. Sign " +
      "and send them yourself. Solana: 'referral' (a Solana address) receives the referral share of the community fee.",
    inputSchema: {
      type: "object",
      properties: {
        ...TRADE_PROPS,
        wallet: { type: "string", description: "Address that will sign and send." },
        referral: { type: "string", description: "Solana only: referral address (yours, for example)." },
      },
      required: ["game_id", "side", "amount", "wallet"],
    },
  },
  {
    name: "send_token_trade",
    title: "Sign and send a token trade",
    annotations: writes("Sign and send a token trade"),
    description:
      "Buy or sell a game's token with the local key (spends from that wallet) and wait for confirmation. Returns the hash.",
    inputSchema: {
      type: "object",
      properties: {
        ...TRADE_PROPS,
        referral: { type: "string", description: "Solana only: referral address." },
      },
      required: ["game_id", "side", "amount"],
    },
  },
];

// ------------------------------------------------------------------ ключи (никогда не печатаются)

function evmKey(): string | null {
  const file = env("IDOSGAMES_EVM_KEY_FILE");
  const raw = file ? readFileSync(file, "utf8").trim() : env("IDOSGAMES_EVM_PRIVATE_KEY");
  if (!raw) return null;
  const k = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error("IDOSGAMES_EVM_PRIVATE_KEY is not a 32-byte hex key");
  return k;
}

function solanaSecret(): Uint8Array | null {
  const file = env("IDOSGAMES_SOLANA_KEYPAIR");
  const raw = file ? readFileSync(file, "utf8") : env("IDOSGAMES_SOLANA_PRIVATE_KEY");
  if (!raw) return null;
  let bytes: unknown;
  try {
    bytes = JSON.parse(raw);
  } catch {
    throw new Error("The Solana key must be a JSON array of 64 bytes (solana-keygen format)");
  }
  if (!Array.isArray(bytes) || bytes.length !== 64) throw new Error("The Solana key must be a JSON array of 64 bytes");
  return Uint8Array.from(bytes as number[]);
}

// Тяжёлые библиотеки сетей грузятся только при вызове токен-тулов: остальной MCP (реестр модулей) стартует как раньше.
const evmLib = () => import("@idosgames/token");
const solLib = () => import("@idosgames/token/solana");
const ethersLib = () => import("ethers");
const web3Lib = () => import("@solana/web3.js");

async function evmSigner(rpcUrl: string) {
  const key = evmKey();
  if (!key) throw new Error("No EVM key: set IDOSGAMES_EVM_PRIVATE_KEY (or IDOSGAMES_EVM_KEY_FILE) for this MCP server");
  const { ethers } = await ethersLib();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return { provider, wallet: new ethers.Wallet(key, provider) };
}

async function solanaKeypair() {
  const secret = solanaSecret();
  if (!secret) throw new Error("No Solana key: set IDOSGAMES_SOLANA_KEYPAIR (path) or IDOSGAMES_SOLANA_PRIVATE_KEY");
  const { Keypair } = await web3Lib();
  return Keypair.fromSecretKey(secret);
}

// ------------------------------------------------------------------ общие мелочи

const str = (args: Record<string, unknown> | undefined, k: string) =>
  typeof args?.[k] === "string" ? (args[k] as string).trim() : "";

type EvmCallJson = { to: string; data: string; value?: string | number | null };

/** Отправить вызовы по очереди, каждый дожидаясь квитанции. */
async function sendEvmCalls(
  wallet: import("ethers").Wallet,
  calls: { to: string; data: string; value?: bigint }[],
): Promise<string[]> {
  const hashes: string[] = [];
  for (const c of calls) {
    const tx = await wallet.sendTransaction({ to: c.to, data: c.data, value: c.value ?? 0n });
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`Transaction reverted: ${tx.hash}`);
    hashes.push(tx.hash);
  }
  return hashes;
}

/** Подтверждение Solana опросом статуса по HTTP (без WebSocket: так выпуск не теряется, инцидент 05.10.2026). */
async function confirmSolana(
  connection: import("@solana/web3.js").Connection,
  signature: string,
  lastValidBlockHeight: number,
): Promise<void> {
  for (;;) {
    const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)} (${signature})`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    if ((await connection.getBlockHeight("confirmed")) > lastValidBlockHeight)
      throw new Error(`Transaction expired before confirmation: ${signature}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

// ------------------------------------------------------------------ выпуск

type LaunchAnswer = {
  Chain?: string;
  From?: string;
  RpcUrl?: string;
  Approvals?: EvmCallJson[];
  Transaction?: EvmCallJson & { chainId?: number };
  SolanaLaunch?: import("@idosgames/token/solana").SolanaLaunchPayload;
};

function launchOf(args: Record<string, unknown> | undefined): LaunchAnswer {
  const raw = args?.["launch"];
  if (!raw || typeof raw !== "object") throw new Error("'launch' must be the answer of build_token_launch_tx");
  // Агент мог передать конверт ответа целиком ({ Success, Data }).
  const data = (raw as { Data?: unknown }).Data;
  return (data && typeof data === "object" ? data : raw) as LaunchAnswer;
}

const bigOf = (v: string | number | null | undefined) => BigInt(v == null || v === "" ? 0 : v);

async function buildLaunch(args: Record<string, unknown> | undefined): Promise<unknown> {
  const a = launchOf(args);
  if (a.SolanaLaunch) {
    const { Connection } = await web3Lib();
    const { buildSolanaLaunchTransaction } = await solLib();
    const p = a.SolanaLaunch;
    const connection = new Connection(p.rpcUrl || "https://api.mainnet-beta.solana.com", "confirmed");
    const built = await buildSolanaLaunchTransaction(connection, p);
    const bytes =
      "version" in built.tx
        ? built.tx.serialize()
        : built.tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    return {
      chain: "solana",
      signer: p.creator,
      mint: built.mint,
      transactionBase64: toBase64(bytes),
      versioned: "version" in built.tx,
      next: "Sign with the creator wallet, send it, then call submit_launch_tx with the signature.",
    };
  }
  if (!a.Transaction) throw new Error("'launch' has neither Transaction (EVM) nor SolanaLaunch");
  return {
    chain: "evm",
    signer: a.From,
    chainId: a.Transaction.chainId,
    calls: [...(a.Approvals ?? []), a.Transaction].map((c) => ({ to: c.to, data: c.data, value: String(bigOf(c.value)) })),
    next: "Send the calls in order from the signer, then call submit_launch_tx with the hash of the last one.",
  };
}

async function sendLaunch(args: Record<string, unknown> | undefined): Promise<unknown> {
  const a = launchOf(args);
  if (a.SolanaLaunch) {
    const { Connection } = await web3Lib();
    const { buildSolanaLaunchTransaction } = await solLib();
    const p = a.SolanaLaunch;
    const kp = await solanaKeypair();
    if (kp.publicKey.toBase58() !== p.creator)
      throw new Error(`The local Solana key is ${kp.publicKey.toBase58()}, the launch was built for ${p.creator}`);
    const connection = new Connection(p.rpcUrl || "https://api.mainnet-beta.solana.com", "confirmed");
    const built = await buildSolanaLaunchTransaction(connection, p);
    let raw: Uint8Array;
    if ("version" in built.tx) {
      built.tx.sign([kp]);
      raw = built.tx.serialize();
    } else {
      built.tx.sign(kp);
      raw = built.tx.serialize();
    }
    const signature = await connection.sendRawTransaction(raw, { maxRetries: 5 });
    await confirmSolana(connection, signature, built.lastValidBlockHeight);
    return { chain: "solana", txHash: signature, mint: built.mint, next: "Call submit_launch_tx with txHash." };
  }
  if (!a.Transaction || !a.RpcUrl) throw new Error("'launch' has neither Transaction + RpcUrl (EVM) nor SolanaLaunch");
  const { wallet } = await evmSigner(a.RpcUrl);
  if (a.From && wallet.address.toLowerCase() !== a.From.toLowerCase())
    throw new Error(`The local EVM key is ${wallet.address}, the launch was built for ${a.From}`);
  const calls = [...(a.Approvals ?? []), a.Transaction].map((c) => ({ to: c.to, data: c.data, value: bigOf(c.value) }));
  const hashes = await sendEvmCalls(wallet, calls);
  return { chain: "evm", txHash: hashes[hashes.length - 1], approvals: hashes.slice(0, -1), next: "Call submit_launch_tx with txHash." };
}

// ------------------------------------------------------------------ сделки

type TradeInput = { gameId: string; isBuy: boolean; amount: string; slippage: number; referral: string };

function tradeInput(args: Record<string, unknown> | undefined): TradeInput {
  const gameId = str(args, "game_id");
  const side = str(args, "side").toLowerCase();
  const amount = str(args, "amount");
  if (!gameId) throw new Error("'game_id' is required");
  if (side !== "buy" && side !== "sell") throw new Error("'side' must be 'buy' or 'sell'");
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) throw new Error("'amount' must be a positive decimal like \"0.05\"");
  const s = typeof args?.["slippage_percent"] === "number" ? (args["slippage_percent"] as number) : 5;
  return { gameId, isBuy: side === "buy", amount, slippage: Math.min(99, Math.max(0, s)), referral: str(args, "referral") };
}

/** Рынок токена + запись реестра его версии (адреса только из реестра, не из аргументов). */
async function tradeContext(gameId: string) {
  const tk = await evmLib();
  const market = await tk.getTokenMarket(gameId, { baseUrl: siteApi() });
  const t = market.Title;
  if (t.Chain === "solana") {
    const raw = await tk.getSolanaChainConfig(t.ChainID, t.RegistryVersion, { baseUrl: engineApi() });
    return { tk, t, solanaRaw: raw, evmCfg: null };
  }
  const cfg = await tk.getEvmChainConfig(t.ChainID, t.RegistryVersion, { baseUrl: engineApi() });
  if (!tk.isV4CoreConfig(cfg)) throw new Error("STACK_NOT_SUPPORTED");
  return { tk, t, solanaRaw: null, evmCfg: cfg as import("@idosgames/token").V4CoreChainConfig };
}

async function erc20Decimals(provider: import("ethers").Provider, token: string | null): Promise<number> {
  if (!token) return 18;
  const { ethers } = await ethersLib();
  return Number(await new ethers.Contract(token, ["function decimals() view returns (uint8)"], provider).getFunction("decimals")());
}

async function evmTrade(input: TradeInput, owner: string | null) {
  const { tk, t, evmCfg } = await tradeContext(input.gameId);
  const cfg = evmCfg!;
  const { ethers } = await ethersLib();
  const provider = new ethers.JsonRpcProvider(cfg.openRpcUrl);
  const market = await tk.resolveV4Core(provider, cfg, t.Token);
  const inToken = input.isBuy ? market.launch.quoteToken : t.Token;
  const outToken = input.isBuy ? t.Token : market.launch.quoteToken;
  const [inDec, outDec] = await Promise.all([erc20Decimals(provider, inToken), erc20Decimals(provider, outToken)]);
  const amountIn = tk.toUnits(input.amount, inDec);
  if (!owner) {
    const out = await tk.quoteV4CoreMarket(provider, cfg, t.Token, market, input.isBuy, amountIn);
    const min = tk.withSlippage(out, input.slippage);
    return { t, cfg, provider, plan: null, quote: { out: tk.fromUnits(out, outDec), minOut: tk.fromUnits(min, outDec) } };
  }
  const plan = await tk.buildV4CoreTrade({
    provider,
    cfg,
    owner,
    token: t.Token,
    isBuy: input.isBuy,
    amountIn,
    slippagePercentage: input.slippage,
  });
  return {
    t,
    cfg,
    provider,
    plan,
    quote: { out: tk.fromUnits(plan.quoted, outDec), minOut: tk.fromUnits(plan.minOut, outDec) },
  };
}

async function solanaTrade(input: TradeInput, owner: string | null) {
  const { t, solanaRaw } = await tradeContext(input.gameId);
  const { Connection, PublicKey } = await web3Lib();
  const sol = await solLib();
  const cfg = sol.parseSolanaTradeConfig(solanaRaw, t.ChainID, t.PoolConfiguration ?? null);
  const rpc = typeof solanaRaw?.["openRpcUrl"] === "string" ? (solanaRaw["openRpcUrl"] as string) : "";
  const connection = new Connection(rpc || "https://api.mainnet-beta.solana.com", "confirmed");
  const mint = new PublicKey(t.Token);
  const venue = await sol.resolveSolanaVenue(connection, cfg, mint);
  const [tokenDec, quoteDec] = await Promise.all([
    sol.mintDecimals(connection, mint),
    sol.mintDecimals(connection, venue.quoteMint),
  ]);
  const { toUnits, fromUnits } = await evmLib();
  const BN = (await import("bn.js")).default;
  const amountIn = new BN(toUnits(input.amount, input.isBuy ? quoteDec : tokenDec).toString());
  const outDec = input.isBuy ? tokenDec : quoteDec;
  const slippageBps = Math.round(input.slippage * 100);
  if (!owner) {
    const q = await sol.quoteSolanaTrade(connection, cfg, mint, input.isBuy, amountIn, slippageBps, !!input.referral);
    return {
      t,
      connection,
      built: null,
      quote: { out: fromUnits(BigInt(q.expectedOut.toString()), outDec), minOut: fromUnits(BigInt(q.netMin.toString()), outDec) },
    };
  }
  const built = await sol.buildSolanaTradeTransaction({
    connection,
    cfg,
    owner: new PublicKey(owner),
    mint,
    isBuy: input.isBuy,
    amountIn,
    slippageBps,
    referral: input.referral || null,
    titleId: t.TitleID,
  });
  return {
    t,
    connection,
    built,
    quote: {
      out: fromUnits(BigInt(built.quote.expectedOut.toString()), outDec),
      minOut: fromUnits(BigInt(built.quote.netMin.toString()), outDec),
    },
  };
}

async function chainOf(gameId: string): Promise<"evm" | "solana"> {
  const tk = await evmLib();
  return (await tk.getTokenMarket(gameId, { baseUrl: siteApi() })).Title.Chain;
}

async function quoteTrade(args: Record<string, unknown> | undefined) {
  const input = tradeInput(args);
  const r = (await chainOf(input.gameId)) === "solana" ? await solanaTrade(input, null) : await evmTrade(input, null);
  return {
    game_id: r.t.TitleID,
    chain: r.t.Chain,
    token: r.t.Token,
    ticker: r.t.Ticker,
    side: input.isBuy ? "buy" : "sell",
    amountIn: input.amount,
    expectedOut: r.quote.out,
    minimumOut: r.quote.minOut,
    slippagePercent: input.slippage,
  };
}

async function buildTrade(args: Record<string, unknown> | undefined) {
  const input = tradeInput(args);
  const wallet = str(args, "wallet");
  if (!wallet) throw new Error("'wallet' is required");
  if ((await chainOf(input.gameId)) === "solana") {
    const r = await solanaTrade(input, wallet);
    const tx = r.built!.tx;
    return {
      chain: "solana",
      signer: wallet,
      expectedOut: r.quote.out,
      minimumOut: r.quote.minOut,
      transactionBase64: toBase64(tx.serialize({ requireAllSignatures: false, verifySignatures: false })),
      next: "Sign with the wallet and send it before its blockhash expires (about a minute).",
    };
  }
  const r = await evmTrade(input, wallet);
  const plan = r.plan!;
  return {
    chain: "evm",
    chainId: r.t.ChainID,
    signer: wallet,
    expectedOut: r.quote.out,
    minimumOut: r.quote.minOut,
    calls: [...plan.approvals, plan.main].map((c) => ({ to: c.to, data: c.data, value: String(c.value ?? 0n) })),
    next: "Send the calls in order from the signer (approvals first). The swap expires in 10 minutes.",
  };
}

async function sendTrade(args: Record<string, unknown> | undefined) {
  const input = tradeInput(args);
  if ((await chainOf(input.gameId)) === "solana") {
    const kp = await solanaKeypair();
    const r = await solanaTrade(input, kp.publicKey.toBase58());
    const tx = r.built!.tx;
    const latest = await r.connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = latest.blockhash;
    tx.sign(kp);
    const signature = await r.connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
    await confirmSolana(r.connection, signature, latest.lastValidBlockHeight);
    return { chain: "solana", txHash: signature, wallet: kp.publicKey.toBase58(), expectedOut: r.quote.out, minimumOut: r.quote.minOut };
  }
  const probe = await tradeContext(input.gameId);
  const { wallet } = await evmSigner(String(probe.evmCfg!.openRpcUrl));
  const r = await evmTrade(input, wallet.address);
  const plan = r.plan!;
  const hashes = await sendEvmCalls(wallet, [...plan.approvals, plan.main]);
  return {
    chain: "evm",
    txHash: hashes[hashes.length - 1],
    approvals: hashes.slice(0, -1),
    wallet: wallet.address,
    expectedOut: r.quote.out,
    minimumOut: r.quote.minOut,
  };
}

async function localWallet() {
  const out: Record<string, string | null> = { evm: null, solana: null };
  const key = evmKey();
  if (key) {
    const { ethers } = await ethersLib();
    out.evm = new ethers.Wallet(key).address;
  }
  if (solanaSecret()) out.solana = (await solanaKeypair()).publicKey.toBase58();
  return {
    ...out,
    hint:
      out.evm || out.solana
        ? "Pass the address as 'wallet' to build_token_launch_tx; send_launch_tx and send_token_trade sign with it."
        : "No key configured: set IDOSGAMES_EVM_PRIVATE_KEY or IDOSGAMES_SOLANA_KEYPAIR in this MCP server's env, or use build_* tools and sign elsewhere.",
  };
}

export async function callTokenTool(name: string, args: Record<string, unknown> | undefined): Promise<Result | null> {
  const run = async (work: () => Promise<unknown>): Promise<Result> => {
    try {
      return { ok: true, value: await work() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
  switch (name) {
    case "get_local_wallet":
      return run(localWallet);
    case "build_launch_tx":
      return run(() => buildLaunch(args));
    case "send_launch_tx":
      return run(() => sendLaunch(args));
    case "quote_token_trade":
      return run(() => quoteTrade(args));
    case "build_token_trade":
      return run(() => buildTrade(args));
    case "send_token_trade":
      return run(() => sendTrade(args));
    default:
      return null;
  }
}
