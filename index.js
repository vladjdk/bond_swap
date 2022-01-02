import { LCDClient, Coin } from "@terra-money/terra.js";
import { createObjectCsvWriter } from "csv-writer";
//connect to bombay testnet
const terra =  new LCDClient({
    URL: 'https://lcd.terra.dev',
    chainID: 'columbus-5',
});

// //get current swap rate from 1 terraUSD to terraCAD
// const offerCoin = new Coin('uusd', '1000000');
// terra.market.swapRate(offerCoin, 'ucad').then(c => {
//     console.log(`${offerCoin.toString()} can be swapped for ${c.toString()}`);
// });

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

const currentBlockInfo = await terra.tendermint.blockInfo();
// console.log(currentBlockInfo)
const currentHeight = currentBlockInfo.block.header.height;

var blocks = [];
var uluna = [];
var bluna = [];
var price = [];
var all = [];

var simulation = "https://fcd.terra.dev/wasm/contracts/terra1jxazgm67et0ce260kvrpfv50acuushpjsz2y0p/store?query_msg=%7B%22simulation%22%3A%7B%22offer_asset%22%3A%7B%22amount%22%3A%221000000000%22%2C%22info%22%3A%7B%22native_token%22%3A%7B%22denom%22%3A%22uluna%22%7D%7D%7D%7D%7D";
var reverse_simulation = "https://fcd.terra.dev/wasm/contracts/terra1jxazgm67et0ce260kvrpfv50acuushpjsz2y0p/store?query_msg=%7B%22simulation%22%3A%7B%22offer_asset%22%3A%7B%22amount%22%3A%221000000000%22%2C%22info%22%3A%7B%22token%22%3A%7B%22contract_addr%22%3A%22terra1kc87mu460fwkqte29rquh4hc20m54fxwtsx7gp%22%7D%7D%7D%7D%7D";

var promises = []

for(var i = 0; i<10000; i++) {
    promises.push(terra.apiRequester.getRaw(`https://fcd.terra.dev/wasm/contracts/terra1jxazgm67et0ce260kvrpfv50acuushpjsz2y0p/store?query_msg=%7B%22pool%22:%7B%7D%7D&height=${currentHeight-i}`));
    if(i%10==0) {
        console.log("Taking a break");
        await sleep(1000);
        console.log("Break time done!");
    }
    if(i%1000==0) {
        console.log(`${i} FINISHED...`)
    }
}

await Promise.all(promises).then(res => {
    for(const c in res) {
        // console.log(res[c].height);
        blocks.push(res[c].height);
        // console.log(res[c].result.assets[0]);
        bluna.push(res[c].result.assets[0].amount);
        // console.log(res[c].result.assets[1]);
        uluna.push(res[c].result.assets[1].amount);
        // console.log(res[c].result.assets[1].amount/res[c].result.assets[0].amount);
        price.push(res[c].result.assets[1].amount/res[c].result.assets[0].amount);
        all.push({block:blocks[c], bluna:bluna[c], uluna:uluna[c], price:price[c]})
    }
});

const csvWriter = createObjectCsvWriter({
    path:'test.csv',
    header: [
        {id: 'block', title: 'Block'},
        {id: 'bluna', title: 'bLuna'},
        {id: 'luna', title: 'luna'},
        {id: 'price', title: 'Price'},
    ]
});

csvWriter
    .writeRecords(all)
    .then(() => console.log("csv written"));

console.log(bluna);
console.log(uluna);
console.log(blocks);
console.log(price);