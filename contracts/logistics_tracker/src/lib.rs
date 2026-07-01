#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, String, Vec, Bytes};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ShipmentStatus {
    Created = 0,
    Dispatched = 1,
    InTransit = 2,
    Delivered = 3,
    Cancelled = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Checkpoint {
    pub status: ShipmentStatus,
    pub location: String,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Shipment {
    pub id: u32,
    pub buyer: Address,
    pub seller: Address,
    pub courier: Address,
    pub escrow_address: Address,
    pub status: ShipmentStatus,
    pub verification_hash: BytesN<32>,
    pub checkpoints: Vec<Checkpoint>,
}

#[contracttype]
pub enum DataKey {
    RegistryAddress,
    ShipmentCounter,
    Shipment(u32),
}

// External interface for CourierRegistry using Soroban contractclient
#[soroban_sdk::contractclient(name = "CourierRegistryClient")]
pub trait CourierRegistryInterface {
    fn is_valid_courier(env: Env, courier_addr: Address) -> bool;
    fn record_delivery(env: Env, courier_addr: Address, rating: u32);
}

// External interface for CargoEscrow using Soroban contractclient
#[soroban_sdk::contractclient(name = "EscrowClient")]
pub trait EscrowInterface {
    fn release_payment(env: Env, shipment_id: u32);
}

#[contract]
pub struct LogisticsTracker;

#[contractimpl]
impl LogisticsTracker {
    pub fn initialize(env: Env, registry_addr: Address) {
        if env.storage().instance().has(&DataKey::RegistryAddress) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::RegistryAddress, &registry_addr);
        env.storage().instance().set(&DataKey::ShipmentCounter, &0u32);
    }

    pub fn create_shipment(
        env: Env,
        buyer: Address,
        seller: Address,
        courier: Address,
        escrow_address: Address,
        verification_hash: BytesN<32>,
    ) -> u32 {
        // Only the escrow contract should ideally create shipments when payment is locked
        escrow_address.require_auth();

        // Verify courier registry
        let registry_addr: Address = env.storage().instance().get(&DataKey::RegistryAddress).unwrap();
        let registry_client = CourierRegistryClient::new(&env, &registry_addr);
        if !registry_client.is_valid_courier(&courier) {
            panic!("Courier is not registered or inactive");
        }

        let mut counter: u32 = env.storage().instance().get(&DataKey::ShipmentCounter).unwrap_or(0);
        counter += 1;
        env.storage().instance().set(&DataKey::ShipmentCounter, &counter);

        let initial_checkpoint = Checkpoint {
            status: ShipmentStatus::Created,
            location: String::from_str(&env, "Seller Facility"),
            timestamp: env.ledger().timestamp(),
        };

        let mut checkpoints = Vec::new(&env);
        checkpoints.push_back(initial_checkpoint);

        let shipment = Shipment {
            id: counter,
            buyer,
            seller,
            courier,
            escrow_address,
            status: ShipmentStatus::Created,
            verification_hash,
            checkpoints,
        };

        env.storage().persistent().set(&DataKey::Shipment(counter), &shipment);

        // Emit creation event
        env.events().publish(
            (symbol_short!("shipment"), symbol_short!("created"), counter),
            (shipment.buyer, shipment.seller, shipment.courier)
        );

        counter
    }

    pub fn update_checkpoint(env: Env, shipment_id: u32, location: String, status: ShipmentStatus) {
        let key = DataKey::Shipment(shipment_id);
        let mut shipment: Shipment = env.storage().persistent().get(&key).expect("Shipment not found");

        // Only the assigned courier can update checkpoints
        shipment.courier.require_auth();

        if shipment.status == ShipmentStatus::Delivered || shipment.status == ShipmentStatus::Cancelled {
            panic!("Cannot update completed or cancelled shipment");
        }

        shipment.status = status;
        let new_checkpoint = Checkpoint {
            status,
            location,
            timestamp: env.ledger().timestamp(),
        };
        shipment.checkpoints.push_back(new_checkpoint);

        env.storage().persistent().set(&key, &shipment);

        // Emit update event
        env.events().publish(
            (symbol_short!("shipment"), symbol_short!("updated"), shipment_id),
            (status, env.ledger().timestamp())
        );
    }

    pub fn confirm_delivery(env: Env, shipment_id: u32, verification_code: Bytes, rating: u32) {
        let key = DataKey::Shipment(shipment_id);
        let mut shipment: Shipment = env.storage().persistent().get(&key).expect("Shipment not found");

        // The courier must authenticate to confirm delivery
        shipment.courier.require_auth();

        if shipment.status == ShipmentStatus::Delivered || shipment.status == ShipmentStatus::Cancelled {
            panic!("Shipment already finalized");
        }

        // Cryptographically verify delivery code: sha256(code) == verification_hash
        let calculated_hash: BytesN<32> = env.crypto().sha256(&verification_code).into();
        if calculated_hash != shipment.verification_hash {
            panic!("Invalid verification code");
        }

        // Update status to Delivered
        shipment.status = ShipmentStatus::Delivered;
        let final_checkpoint = Checkpoint {
            status: ShipmentStatus::Delivered,
            location: String::from_str(&env, "Recipient Address"),
            timestamp: env.ledger().timestamp(),
        };
        shipment.checkpoints.push_back(final_checkpoint);
        env.storage().persistent().set(&key, &shipment);

        // 1. Cross-contract call to release funds in CargoEscrow
        let escrow_client = EscrowClient::new(&env, &shipment.escrow_address);
        escrow_client.release_payment(&shipment_id);

        // 2. Cross-contract call to record courier score
        let registry_addr: Address = env.storage().instance().get(&DataKey::RegistryAddress).unwrap();
        let registry_client = CourierRegistryClient::new(&env, &registry_addr);
        registry_client.record_delivery(&shipment.courier, &rating);

        // Emit delivery event
        env.events().publish(
            (symbol_short!("shipment"), symbol_short!("delivered"), shipment_id),
            (shipment.courier, env.ledger().timestamp())
        );
    }

    pub fn get_shipment(env: Env, shipment_id: u32) -> Option<Shipment> {
        env.storage().persistent().get(&DataKey::Shipment(shipment_id))
    }
}
