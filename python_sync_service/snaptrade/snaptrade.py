import sys, os
from snaptrade_client import SnapTrade
from datetime import datetime
from sync_services.helper_functions import save_list_to_json, anonymise
from dotenv import load_dotenv
import psycopg2


load_dotenv(dotenv_path="../../.env")

DATABASE_URL = os.getenv("DATABASE_URL")
SNAPTRADE_CLIENT_ID = os.getenv("SNAPTRADE_CLIENT_ID")
SNAPTRADE_CONSUMER_KEY = os.getenv("SNAPTRADE_CONSUMER_KEY")
SNAPTRADE_USER_ID = os.getenv("SNAPTRADE_USER_ID")
SNAPTRADE_USER_SECRET = os.getenv("SNAPTRADE_USER_SECRET")
WS_ACCOUNT_NUM= os.getenv("WS_ACCOUNT_NUM")

conn = psycopg2.connect(DATABASE_URL)
snaptrade = SnapTrade(
    client_id=SNAPTRADE_CLIENT_ID,
    consumer_key=SNAPTRADE_CONSUMER_KEY
)

def get_accounts():
    accounts = snaptrade.account_information.list_user_accounts(
        user_id=SNAPTRADE_USER_ID,
        user_secret=SNAPTRADE_USER_SECRET
    )
    return accounts.body

def get_account_holdings(account_id):
    userHoldings = snaptrade.account_information.get_user_holdings(
        account_id=account_id,
        user_id=SNAPTRADE_USER_ID,
        user_secret=SNAPTRADE_USER_SECRET
    )
    return userHoldings.body

def get_account_balance(account_id):
    acc_balance = snaptrade.account_information.get_user_account_balance(
        account_id=account_id,
        user_id=SNAPTRADE_USER_ID,
        user_secret=SNAPTRADE_USER_SECRET
    )
    return(acc_balance.body)

def account_positions (account_id):
    acc_positions = snaptrade.account_information.get_user_account_positions(
        account_id=account_id,
        user_id=SNAPTRADE_USER_ID,
        user_secret=SNAPTRADE_USER_SECRET
    )
    return acc_positions.body

def account_activities_by_type (account_id, type, start_date, end_date):
    account_activities = snaptrade.account_information.get_account_activities(
        account_id=account_id,
        user_id=SNAPTRADE_USER_ID,
        user_secret=SNAPTRADE_USER_SECRET,
        start_date=start_date,
        end_date= end_date,
        type=type
    )
    return account_activities.body

def fetch_all_activities(accounts: List):
    for account in accounts:
        
    
all_accounts = get_accounts()
save_list_to_json(anonymise(all_accounts),"all_accounts","")
print(len(all_accounts))
all_transactions = account_activities_by_type(WS_ACCOUNT_NUM,"BUY","20202")
print("List Length " + str(len(all_transactions)))
print(all_transactions["data"][0])
save_list_to_json(anonymise(all_transactions["data"]),"transactions_by_account_BUY","")