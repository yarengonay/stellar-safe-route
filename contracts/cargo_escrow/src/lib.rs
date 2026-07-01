#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, token};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Locked = 0,
    Released = 1,
    Refunded = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowOrder {
    pub shipment_id: u32,
    pub buyer: Address,
    pub seller: Address,
    pub courier: Address,
    pub token: Address,
    pub amount: i128,
    pub status: EscrowStatus,
    pub timeout_timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    LogisticsContract,
    Order(u32),
}

// External interface for LogisticsTracker using Soroban contractclient
#[soroban_sdk::contractclient(name = "LogisticsTrackerClient")]
pub trait LogisticsTrackerInterface {
    fn create_shipment(
        env: Env,
        buyer: Address,
        seller: Address,
        courier: Address,
        escrow_address: Address,
        verification_hash: BytesN<32>,
    ) -> u32;
}

#[contract]
pub struct CargoEscrow;

#[contractimpl]
impl CargoEscrow {
    pub fn initialize(env: Env, logistics_contract: Address) {
        if env.storage().instance().has(&DataKey::LogisticsContract) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::LogisticsContract, &logistics_contract);
    }

    pub fn lock_payment(
        env: Env,
        buyer: Address,
        seller: Address,
        courier: Address,
        token: Address,
        amount: i128,
        verification_hash: BytesN<32>,
        timeout_duration: u64,
    ) -> u32 {
        buyer.require_auth();

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // 1. Transfer tokens from buyer to escrow contract
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&buyer, &env.current_contract_address(), &amount);

        // 2. Compute expiration timestamp
        let timeout_timestamp = env.ledger().timestamp() + timeout_duration;

        // 3. Call LogisticsTracker to create the shipment
        let logistics_addr: Address = env.storage().instance().get(&DataKey::LogisticsContract).unwrap();
        let logistics_client = LogisticsTrackerClient::new(&env, &logistics_addr);
        
        let shipment_id = logistics_client.create_shipment(
            &buyer,
            &seller,
            &courier,
            &env.current_contract_address(),
            &verification_hash,
        );

        // 4. Save the Escrow Order state
        let order = EscrowOrder {
            shipment_id,
            buyer,
            seller,
            courier,
            token,
            amount,
            status: EscrowStatus::Locked,
            timeout_timestamp,
        };

        env.storage().persistent().set(&DataKey::Order(shipment_id), &order);

        // Emit locked event
        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("locked"), shipment_id),
            (order.buyer, order.seller, order.amount)
        );

        shipment_id
    }

    pub fn release_payment(env: Env, shipment_id: u32) {
        // Authenticate that only the LogisticsTracker contract can release funds
        let logistics_addr: Address = env.storage().instance().get(&DataKey::LogisticsContract).unwrap();
        logistics_addr.require_auth();

        let key = DataKey::Order(shipment_id);
        let mut order: EscrowOrder = env.storage().persistent().get(&key).expect("Order not found");

        if order.status != EscrowStatus::Locked {
            panic!("Order not locked");
        }

        order.status = EscrowStatus::Released;
        env.storage().persistent().set(&key, &order);

        // Calculate fee splits (95% to seller, 5% to courier)
        let token_client = token::Client::new(&env, &order.token);
        let courier_share = (order.amount * 5) / 100;
        let seller_share = order.amount - courier_share;

        if seller_share > 0 {
            token_client.transfer(&env.current_contract_address(), &order.seller, &seller_share);
        }
        if courier_share > 0 {
            token_client.transfer(&env.current_contract_address(), &order.courier, &courier_share);
        }

        // Emit released event
        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("released"), shipment_id),
            (order.seller, order.courier, order.amount)
        );
    }

    pub fn refund_buyer(env: Env, shipment_id: u32) {
        let key = DataKey::Order(shipment_id);
        let mut order: EscrowOrder = env.storage().persistent().get(&key).expect("Order not found");

        if order.status != EscrowStatus::Locked {
            panic!("Order not locked");
        }

        // Verify timeout has passed
        let current_time = env.ledger().timestamp();
        if current_time < order.timeout_timestamp {
            panic!("Timeout not yet reached");
        }

        order.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &order);

        // Refund all tokens back to buyer
        let token_client = token::Client::new(&env, &order.token);
        token_client.transfer(&env.current_contract_address(), &order.buyer, &order.amount);

        // Emit refunded event
        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("refunded"), shipment_id),
            (order.buyer, order.amount)
        );
    }

    pub fn get_order(env: Env, shipment_id: u32) -> Option<EscrowOrder> {
        env.storage().persistent().get(&DataKey::Order(shipment_id))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{Env, Address, BytesN, testutils::Address as _, testutils::Ledger as _, token, Bytes, String};
    use courier_registry::{CourierRegistry, CourierRegistryClient};
    use logistics_tracker::{LogisticsTracker, LogisticsTrackerClient, ShipmentStatus};

    #[test]
    fn test_integration_flow() {
        let env = Env::default();
        env.mock_all_auths();

        // 1. Deploy CourierRegistry
        let registry_id = env.register_contract(None, CourierRegistry);
        let registry_client = CourierRegistryClient::new(&env, &registry_id);
        
        let admin = Address::generate(&env);
        registry_client.initialize(&admin);

        let courier = Address::generate(&env);
        registry_client.register_courier(&courier);

        // Verify courier is active
        assert!(registry_client.is_valid_courier(&courier));

        // 2. Deploy LogisticsTracker
        let tracker_id = env.register_contract(None, LogisticsTracker);
        let tracker_client = LogisticsTrackerClient::new(&env, &tracker_id);
        tracker_client.initialize(&registry_id);

        // 3. Deploy CargoEscrow
        let escrow_id = env.register_contract(None, CargoEscrow);
        let escrow_client = CargoEscrowClient::new(&env, &escrow_id);
        escrow_client.initialize(&tracker_id);

        // 4. Deploy Mock Token
        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(token_admin);
        let token_client = token::Client::new(&env, &token_id);
        
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);

        let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
        token_admin_client.mint(&buyer, &1000);

        assert_eq!(token_client.balance(&buyer), 1000);

        // 5. Buyer locks payment
        let verification_code = Bytes::from_slice(&env, b"secret123");
        let verification_hash: BytesN<32> = env.crypto().sha256(&verification_code).into();
        let timeout_duration = 3600; // 1 hour

        let shipment_id = escrow_client.lock_payment(
            &buyer,
            &seller,
            &courier,
            &token_id,
            &1000,
            &verification_hash,
            &timeout_duration
        );

        assert_eq!(shipment_id, 1);
        assert_eq!(token_client.balance(&buyer), 0);
        assert_eq!(token_client.balance(&escrow_id), 1000);

        // Verify shipment details in tracker
        let shipment = tracker_client.get_shipment(&shipment_id).unwrap();
        assert_eq!(shipment.buyer, buyer);
        assert_eq!(shipment.seller, seller);
        assert_eq!(shipment.courier, courier);
        assert_eq!(shipment.status, ShipmentStatus::Created);

        // 6. Courier updates status
        let location = String::from_str(&env, "Main Hub");
        tracker_client.update_checkpoint(&shipment_id, &location, &ShipmentStatus::InTransit);
        let shipment_updated = tracker_client.get_shipment(&shipment_id).unwrap();
        assert_eq!(shipment_updated.status, ShipmentStatus::InTransit);

        // 7. Courier delivers and confirms
        // 95% to seller (950), 5% to courier (50)
        tracker_client.confirm_delivery(&shipment_id, &verification_code, &5u32);

        assert_eq!(token_client.balance(&escrow_id), 0);
        assert_eq!(token_client.balance(&seller), 950);
        assert_eq!(token_client.balance(&courier), 50);

        let shipment_delivered = tracker_client.get_shipment(&shipment_id).unwrap();
        assert_eq!(shipment_delivered.status, ShipmentStatus::Delivered);

        // Verify courier ratings
        let courier_info = registry_client.get_courier(&courier).unwrap();
        assert_eq!(courier_info.delivery_count, 1);
        assert_eq!(courier_info.rating_sum, 5);
    }

    #[test]
    #[should_panic(expected = "Timeout not yet reached")]
    fn test_refund_before_timeout_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let registry_id = env.register_contract(None, CourierRegistry);
        let registry_client = CourierRegistryClient::new(&env, &registry_id);
        let admin = Address::generate(&env);
        registry_client.initialize(&admin);
        let courier = Address::generate(&env);
        registry_client.register_courier(&courier);

        let tracker_id = env.register_contract(None, LogisticsTracker);
        let tracker_client = LogisticsTrackerClient::new(&env, &tracker_id);
        tracker_client.initialize(&registry_id);

        let escrow_id = env.register_contract(None, CargoEscrow);
        let escrow_client = CargoEscrowClient::new(&env, &escrow_id);
        escrow_client.initialize(&tracker_id);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(token_admin);
        
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);

        let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
        token_admin_client.mint(&buyer, &1000);

        let verification_code = Bytes::from_slice(&env, b"secret123");
        let verification_hash: BytesN<32> = env.crypto().sha256(&verification_code).into();
        let timeout_duration = 3600; // 1 hour

        let shipment_id = escrow_client.lock_payment(
            &buyer,
            &seller,
            &courier,
            &token_id,
            &1000,
            &verification_hash,
            &timeout_duration
        );

        // Try to refund before timeout (ledger time is 0 by default, timeout is 3600)
        escrow_client.refund_buyer(&shipment_id);
    }

    #[test]
    fn test_refund_after_timeout_succeeds() {
        let env = Env::default();
        env.mock_all_auths();

        let registry_id = env.register_contract(None, CourierRegistry);
        let registry_client = CourierRegistryClient::new(&env, &registry_id);
        let admin = Address::generate(&env);
        registry_client.initialize(&admin);
        let courier = Address::generate(&env);
        registry_client.register_courier(&courier);

        let tracker_id = env.register_contract(None, LogisticsTracker);
        let tracker_client = LogisticsTrackerClient::new(&env, &tracker_id);
        tracker_client.initialize(&registry_id);

        let escrow_id = env.register_contract(None, CargoEscrow);
        let escrow_client = CargoEscrowClient::new(&env, &escrow_id);
        escrow_client.initialize(&tracker_id);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(token_admin);
        let token_client = token::Client::new(&env, &token_id);
        
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);

        let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
        token_admin_client.mint(&buyer, &1000);

        let verification_code = Bytes::from_slice(&env, b"secret123");
        let verification_hash: BytesN<32> = env.crypto().sha256(&verification_code).into();
        let timeout_duration = 3600; // 1 hour

        let shipment_id = escrow_client.lock_payment(
            &buyer,
            &seller,
            &courier,
            &token_id,
            &1000,
            &verification_hash,
            &timeout_duration
        );

        // Jump ledger time forward to 3601
        env.ledger().set_timestamp(3601);

        // Refund should succeed now
        escrow_client.refund_buyer(&shipment_id);

        assert_eq!(token_client.balance(&buyer), 1000);
        assert_eq!(token_client.balance(&escrow_id), 0);

        let order = escrow_client.get_order(&shipment_id).unwrap();
        assert_eq!(order.status, EscrowStatus::Refunded);
    }
}

