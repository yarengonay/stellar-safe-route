#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Courier {
    pub address: Address,
    pub is_active: bool,
    pub rating_sum: u32,
    pub delivery_count: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Courier(Address),
}

#[contract]
pub struct CourierRegistry;

#[contractimpl]
impl CourierRegistry {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn register_courier(env: Env, courier_addr: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let key = DataKey::Courier(courier_addr.clone());
        if env.storage().persistent().has(&key) {
            panic!("Courier already registered");
        }

        let courier = Courier {
            address: courier_addr.clone(),
            is_active: true,
            rating_sum: 0,
            delivery_count: 0,
        };

        env.storage().persistent().set(&key, &courier);
    }

    pub fn set_active(env: Env, courier_addr: Address, active: bool) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let key = DataKey::Courier(courier_addr.clone());
        let mut courier: Courier = env.storage().persistent().get(&key).expect("Courier not found");
        courier.is_active = active;
        env.storage().persistent().set(&key, &courier);
    }

    pub fn get_courier(env: Env, courier_addr: Address) -> Option<Courier> {
        let key = DataKey::Courier(courier_addr);
        env.storage().persistent().get(&key)
    }

    pub fn is_valid_courier(env: Env, courier_addr: Address) -> bool {
        let key = DataKey::Courier(courier_addr);
        if let Some(courier) = env.storage().persistent().get::<_, Courier>(&key) {
            courier.is_active
        } else {
            false
        }
    }

    pub fn record_delivery(env: Env, courier_addr: Address, rating: u32) {
        let key = DataKey::Courier(courier_addr.clone());
        let mut courier: Courier = env.storage().persistent().get(&key).expect("Courier not found");
        courier.delivery_count += 1;
        if rating > 0 && rating <= 5 {
            courier.rating_sum += rating;
        }
        env.storage().persistent().set(&key, &courier);
    }
}
