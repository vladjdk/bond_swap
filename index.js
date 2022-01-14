import { LCDClient, Coin, Int } from "@terra-money/terra.js";
import { createObjectCsvWriter } from "csv-writer";
//connect to bombay testnet
const terra =  new LCDClient({
    URL: 'https://lcd.terra.dev',
    chainID: 'columbus-5',
});

const blocksBack = 100;

const pools = {
    ts_lunabluna:"terra1jxazgm67et0ce260kvrpfv50acuushpjsz2y0p"
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function standardDeviation(values){
    var avg = average(values);
    
    var squareDiffs = values.map(function(value){
      var diff = value - avg;
      var sqrDiff = diff * diff;
      return sqrDiff;
    });
    
    var avgSquareDiff = average(squareDiffs);
  
    var stdDev = Math.sqrt(avgSquareDiff);
    return stdDev;
}
  
function average(data){
    var sum = data.reduce(function(sum, value){
        return sum + value;
    }, 0);

    var avg = sum / data.length;
    return avg;
}

var simulation = "https://fcd.terra.dev/wasm/contracts/terra1jxazgm67et0ce260kvrpfv50acuushpjsz2y0p/store?query_msg=%7B%22simulation%22%3A%7B%22offer_asset%22%3A%7B%22amount%22%3A%221000000000%22%2C%22info%22%3A%7B%22native_token%22%3A%7B%22denom%22%3A%22uluna%22%7D%7D%7D%7D%7D";
var reverse_simulation = "https://fcd.terra.dev/wasm/contracts/terra1jxazgm67et0ce260kvrpfv50acuushpjsz2y0p/store?query_msg=%7B%22simulation%22%3A%7B%22offer_asset%22%3A%7B%22amount%22%3A%221000000000%22%2C%22info%22%3A%7B%22token%22%3A%7B%22contract_addr%22%3A%22terra1kc87mu460fwkqte29rquh4hc20m54fxwtsx7gp%22%7D%7D%7D%7D%7D";

var blocks = [];
var uluna = [];
var bluna = [];
var price = [];
var all = [];
var m = 0;
var std = 0

var currentBlockInfo = await terra.tendermint.blockInfo();
// console.log(currentBlockInfo)
var currentHeight = currentBlockInfo.block.header.height;
var startingBlockHeight = currentHeight-blocksBack;

//rewriting above algorithm to include synchronization
while(true) {

    var currentBlockInfo = await terra.tendermint.blockInfo();
    // console.log(currentBlockInfo)
    var currentHeight = currentBlockInfo.block.header.height;

    console.log(`Current Block: ${currentHeight}`);

    var promises = []
    var c = 0;
    for(var i = startingBlockHeight; i<=currentHeight; i++) {
        promises.push(terra.apiRequester.getRaw(`https://fcd.terra.dev/wasm/contracts/${pools.ts_lunabluna}/store?query_msg=%7B%22pool%22:%7B%7D%7D&height=${i}`));
        if(c%10==0) {
            await sleep(1000);
        }
        c++;
        if(c%1000==0) {
            console.log(`${c} : ${i} FINISHED...`)
        }
    }

    //waiting for and implicitly sorting all the promises by block height
    await Promise.all(promises).then(res => {
        for(const c in res) {
            // console.log(res[c].height);
            blocks.unshift(res[c].height);
            // console.log(res[c].result.assets[0]);
            bluna.unshift(res[c].result.assets[0].amount);
            // console.log(res[c].result.assets[1]);
            uluna.unshift(res[c].result.assets[1].amount);
            // console.log(res[c].result.assets[1].amount/res[c].result.assets[0].amount);
            price.unshift(res[c].result.assets[1].amount/res[c].result.assets[0].amount);
            all.unshift({block:blocks[c], bluna:bluna[c], uluna:uluna[c], price:price[c]})
        }
    });

    startingBlockHeight = blocks[0];

    while(blocksBack != all.length) {
        blocks.pop()
        bluna.pop()
        uluna.pop()
        price.pop()
        all.pop()
    }

    m = average(price);
    std = standardDeviation(price);

    console.log(`Mean: ${m}`);
    console.log(`Standard Deviation: ${std}`);
    console.log(`Current Price: ${price[0]}`);
    console.log();
    // console.log(`Last Price: ${lastPrice}`)

    await sleep(3000); //poll every 3 seconds

}