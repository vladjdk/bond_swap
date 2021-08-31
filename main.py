from terra_sdk.core import Coins
from terra_sdk.core.wasm import MsgExecuteContract
from terra_sdk.core.strings import AccAddress
from terra_sdk.client.lcd import LCDClient
from terra_sdk.key.mnemonic import MnemonicKey
import pandas as pd
import time
import datetime

# CONFIG

mnemonic = MnemonicKey(mnemonic="aaAAAA")  # TODO: INSERT MNEMONIC HERE
use_testnet = False

testnet = {  # this is the LUNA-UST pool since the testnet doesnt have a LUNA-BLUNA pool
    "url": "https://tequila-lcd.terra.dev",
    "chain_id": "tequila-0004",
    "terraswap_address": "terra156v8s539wtz0sjpn8y8a8lfg8fhmwa7fy22aff"
}

mainnet = {
    "url": "https://lcd.terra.dev",
    "chain_id": "columbus-4",
    "terraswap_address": "terra1jxazgm67et0ce260kvrpfv50acuushpjsz2y0p",
    "reverse_address": "terra1kc87mu460fwkqte29rquh4hc20m54fxwtsx7gp"
}

net = testnet if use_testnet else mainnet

terra = LCDClient(chain_id=net["chain_id"], url=net["url"])
wallet = terra.wallet(mnemonic)

def get_exchange_rate(amount, asset):
    contract = net["terraswap_address"]

    if asset == "uluna":
        result = terra.wasm.contract_query(
            contract,
            {
                "simulation": {
                    "offer_asset": {
                        "amount": str(int(amount * 1000000)),
                        "info": {
                            "native_token": {
                                "denom": "uluna"
                            }
                        }
                    }
                }
            }
        )
    else:
        result = terra.wasm.contract_query(
            contract,
            {
                "reverse_simulation": {
                    "ask_asset": {
                        "amount": str(int(amount * 1000000)),
                        "info": {
                            "token": {
                                "contract_addr": net['reverse_address']
                            }
                        }
                    }
                }
            }
        )
    return result


def get_minimum_received(amount, asset):  # https://github.com/terraswap/terraswap-web-app/blob/main/src/helpers/calc.ts
    res = get_exchange_rate(amount, asset)
    max_spread = 0.01  # https://github.com/terraswap/terraswap-web-app/blob/main/src/constants/constants.ts
    commission = 0.03
    rate_1 = 1-max_spread
    rate_2 = 1-commission
    if asset == "uluna":
        return (int(res["return_amount"])*rate_1-int(res["commission_amount"])-int(res['spread_amount'])) / 1000000
    else:
        return (int(res["offer_amount"]) * rate_1 - int(res["commission_amount"]) - int(
            res['spread_amount'])) / 1000000


def document_rates(amount, sleep_time, data_points):
    res = []
    for i in range(data_points):
        res.append({"time": datetime.datetime.now(), "rate": get_minimum_received(amount) / amount})
        time.sleep(sleep_time)
    df = pd.DataFrame(res)
    df.to_csv("rates.csv")


def swap(amount, coin):
    if coin == "uluna":
        msg = MsgExecuteContract(
            sender=wallet.key.acc_address,  # TODO: fix wallet
            contract=AccAddress(net["terraswap_address"]),
            execute_msg={
                "swap": {
                    "offer_asset": {
                        "amount": str(int(amount * 1000000)),
                        "info": {
                            "native_token": {
                                "denom": "uluna"
                            }
                        }
                    }
                }
            },
            coins=Coins(uluna=int(amount * 1000000))
        )
    elif coin == "bluna":
        msg = MsgExecuteContract(
            sender=wallet.key.acc_address,  # TODO: fix wallet
            contract=AccAddress(net["reverse_address"]),
            execute_msg={
                "send": {
                    "amount": str(int(amount * 1000000)),
                    "contract": net["terraswap_address"],
                    "msg": "eyJzd2FwIjp7fX0="
                }
            },
            coins=Coins()
        )
    else:
        raise ValueError("Wrong value: coin must be of value uluna or bluna, got {} instead".format(coin))

    execute_tx = wallet.create_and_sign_tx(msgs=[msg],gas_prices="0.5uusd", gas_adjustment="2.5")
    execute_tx_result = terra.tx.broadcast(execute_tx)
    print(execute_tx_result)
    return execute_tx_result


def run(amount, sleep_time, trade_type, num_swaps, burn_rate, mint_rate):
    if trade_type not in ["burn", "mint"]:
        raise ValueError("Trade type must be burn or mint. Received {} instead.".format(trade_type))
        return

    uluna_amount = amount
    bluna_amount = amount

    if trade_type == "mint":
        previous_tx = "burn"
    else:
        previous_tx = "mint"
    swaps = 0
    while swaps < num_swaps:
        if previous_tx == "burn":
            rate = int(get_exchange_rate(uluna_amount, "uluna")['return_amount']) / (uluna_amount*1000000)
            min_rate = get_minimum_received(uluna_amount, "uluna") / uluna_amount
        else:
            rate = (bluna_amount * 1000000) / int(get_exchange_rate(bluna_amount, "bluna")['offer_amount'])
            min_rate = bluna_amount/get_minimum_received(bluna_amount, "bluna")
        print("Swaps Done: {}, Rate: {}, Min. Rate: {}".format(swaps, rate, min_rate))

        if min_rate >= mint_rate:
            current_tx = "mint"
        elif min_rate <= burn_rate:
            current_tx = "burn"
        else:
            current_tx = previous_tx

        if current_tx == previous_tx:
            pass
        elif current_tx == "burn":
            tx = swap(bluna_amount, "bluna")
            uluna_amount = float((tx.logs[0].events_by_type["transfer"]["amount"][0].replace("uluna", "")))/1000000
            print("Traded {}bluna to {}luna.".format(bluna_amount, uluna_amount))
            previous_tx = "burn"
            swaps += 1
        elif current_tx == "mint":
            tx = swap(uluna_amount, "uluna")
            bluna_amount = float((tx.logs[0].events_by_type["from_contract"]["return_amount"][0]))/1000000
            print("Traded {}luna to {}bluna.".format(uluna_amount, bluna_amount))
            previous_tx = "mint"
            swaps += 1
        time.sleep(sleep_time)

