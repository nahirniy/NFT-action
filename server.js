import express from "express";
import cors from "cors";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
    getMintLen,
    ExtensionType,
    TYPE_SIZE,
    LENGTH_SIZE,
    TOKEN_2022_PROGRAM_ID,
    createInitializeMintInstruction,
    createInitializeMetadataPointerInstruction,
    getAssociatedTokenAddressSync,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    createMintToCheckedInstruction,
    createSetAuthorityInstruction,
    AuthorityType,
} from "@solana/spl-token";
import { pack, createInitializeInstruction } from "@solana/spl-token-metadata";
import { createPostResponse } from "@solana/actions";

const vaultSolana = new PublicKey("EtuhWPuFFZEvytybMFt545JZ3R8tUMLuFsGjju6PNvGE");
const connection = new Connection(clusterApiUrl("devnet"));

const PORT = 8080;
// const BASE_URL = `http://localhost:${PORT}`;
const BASE_URL = `https://dexola-nft.vercel.app`;

// Express app setup
const app = express();
app.use(express.json());
app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Content-Encoding", "Accept-Encoding"],
    })
);

app.get("/actions.json", getActionsJson);
app.get("/api/actions/mint-nft", getMintNFT);
app.post("/api/actions/mint-nft", postMintNFT);

function getActionsJson(req, res) {
    const payload = {
        rules: [
            { pathPattern: "/*", apiPath: "/api/actions/*" },
            { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
        ],
    };
    res.json(payload);
}

async function getMintNFT(req, res) {
    try {
        const baseHref = `${BASE_URL}/api/actions/mint-nft`;

        const payload = {
            title: "Dexola NFT",
            icon: "https://i.postimg.cc/SRLt1RRm/a6e3b3e6-6770-4088-bcb8-6ff00e05dfe2-medium.jpg",
            description: "Mint is an exclusive NFT from Dexola",
            links: {
                actions: [{ label: "Mint for 0.1 SOL", href: `${baseHref}` }],
            },
        };

        res.json(payload);
    } catch (err) {
        console.log(err);
    }
}

async function postMintNFT(req, res) {
    try {
        const { account } = req.body;

        const fromAccount = new PublicKey(account);
        const token = Keypair.generate();

        const metaData = {
            updateAuthority: SystemProgram.programId,
            mint: token.publicKey,
            name: "Dexola",
            symbol: "DXL",
            uri: "https://gist.githubusercontent.com/nahirniy-dexola/6c55f4cfe63bfb70ef25ddc4663fc9fd/raw/2d9d185290d1a5d22580b21a07364a514c82bc9a/dexolaNFT.json",
            additionalMetadata: [],
        };

        const mintLen = getMintLen([ExtensionType.MetadataPointer]);
        const metadataExtension = TYPE_SIZE + LENGTH_SIZE;
        const metadataLen = pack(metaData).length;
        const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataExtension + metadataLen);

        const transaction = createTransaction(fromAccount, token.publicKey, metaData, lamports, mintLen);
        transaction.feePayer = fromAccount;
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

        const payload = await createPostResponse({
            fields: {
                transaction,
                message: `NFT successfully mint to ${fromAccount.toBase58()}!`,
            },
            signers: [token],
        });

        res.json(payload);
    } catch (err) {
        res.status(400).json({ error: err.message || "An unknown error occurred" });
        console.log(err);
    }
}

function createTransaction(account, token, metaData, lamports, space) {
    const transaction = new Transaction();

    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: account,
        newAccountPubkey: token,
        space: space,
        lamports: lamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeMintInstruction = createInitializeMintInstruction(
        token, // Mint Account Address
        0, // Decimals of Mint
        account, // Designated Mint Authority
        account, // Optional Freeze Authority
        TOKEN_2022_PROGRAM_ID // Token Extension Program ID
    );

    const initializeMetadataInstruction = createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID, // Token Extension Program as Metadata Program
        metadata: token, // Account address that holds the metadata
        updateAuthority: account, // Authority that can update the metadata
        mint: token, // Mint Account address
        mintAuthority: account, // Designated Mint Authority
        name: metaData.name,
        symbol: metaData.symbol,
        uri: metaData.uri,
    });

    const initializeMetadataPointerInstruction = createInitializeMetadataPointerInstruction(
        token, // Mint Account address
        SystemProgram.programId, // Authority that can set the metadata address
        token, // Account address that holds the metadata
        TOKEN_2022_PROGRAM_ID
    );

    const user_ata = getAssociatedTokenAddressSync(token, account, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

    let create_ata = createAssociatedTokenAccountInstruction(
        account,
        user_ata,
        account,
        token,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    let mint_ix = createMintToCheckedInstruction(token, user_ata, account, 1, 0, [], TOKEN_2022_PROGRAM_ID);

    let transfer_mint_auth = createSetAuthorityInstruction(
        token,
        account,
        AuthorityType.MintTokens, // authority type
        null,
        [],
        TOKEN_2022_PROGRAM_ID
    );

    let transfer_sol = SystemProgram.transfer({
        fromPubkey: account,
        toPubkey: vaultSolana,
        lamports: 0.1 * LAMPORTS_PER_SOL,
    });

    transaction.add(createAccountInstruction);
    transaction.add(initializeMetadataPointerInstruction);
    transaction.add(initializeMintInstruction);
    transaction.add(initializeMetadataInstruction);
    transaction.add(create_ata);
    transaction.add(mint_ix);
    transaction.add(transfer_mint_auth);
    transaction.add(transfer_sol);

    return transaction;
}

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
