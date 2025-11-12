import React, { useState, useRef, useEffect, useCallback } from 'react';

// --- Configuration ---
const API_URL = 'wss://ws.deriv.com/websockets/v3?app_id=106629';

// Map Deriv contract types to user-friendly UI categories
const CONTRACT_GROUPS = {
    CALL: 'Up/Down', PUT: 'Up/Down',
    ONETOUCH: 'Touch/No-Touch', NOTOUCH: 'Touch/No-Touch',
    EXPIRYRANGE: 'Range', ASIANUP: 'Range', ASIANDOWN: 'Range', EXPIRYMISS: 'Range',
    DIGITMATCH: 'Digits', DIGITDIFF: 'Digits', DIGITOVER: 'Digits', DIGITUNDER: 'Digits', DIGITEVEN: 'Digits', DIGITODD: 'Digits',
    TICKHIGH: 'Higher/Lower', TICKLOW: 'Higher/Lower',
    SPREADU: 'Spread', SPREADD: 'Spread',
    MULTUP: 'Multipliers', MULTDOWN: 'Multipliers',
    ACCU_C: 'Accumulators', ACCU_B: 'Accumulators',
    LBALL: 'Lookbacks', LBHIGH: 'Lookbacks', LBLOW: 'Lookbacks',
    RESETCALL: 'Reset', RESETPUT: 'Reset',
};


// --- Helper SVG Icons ---
const IconRise = () => (<svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>);
const IconFall = () => (<svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>);
const IconPlay = () => (<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>);
const IconArrowLeft = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>);
const IconArrowRight = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>);

// --- Custom Input/Select Components ---
const CustomSelect = ({ label, value, onChange, children, labelClass = "text-cyan-300", name, disabled = false }) => (
    <div className="flex flex-col gap-1.5">
        {label && <label className={`text-sm font-medium ${labelClass}`}>{label}</label>}
        <select
            name={name}
            className={`form-select bg-[#2a3441] border border-[#455263] text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full ${disabled ? 'opacity-50' : ''}`}
            value={value}
            onChange={onChange}
            disabled={disabled}
        >
            {children}
        </select>
    </div>
);

const CustomInput = ({ label, value, onChange, type = "number", step = "0.01", min, max, name, placeholder = "", labelClass = "text-white", readOnly = false }) => (
    <div className="flex flex-col gap-1.5">
        <label className={`text-sm font-medium ${labelClass}`}>{label}</label>
        <input
            name={name}
            type={type}
            step={step}
            min={min}
            max={max}
            placeholder={placeholder}
            className="form-input bg-[#2a3441] border border-[#455263] text-white text-sm rounded-md px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={value}
            onChange={onChange}
            readOnly={readOnly}
        />
    </div>
);

// --- Main Bot Component ---
export default function TradingBotSlider() {
    const [index, setIndex] = useState(0); // 0=config, 1=transactions, 2=history
    const [isSliderVisible, setIsSliderVisible] = useState(true);

    // --- API & Connection State ---
    const wsRef = useRef(null);
    const messageQueueRef = useRef([]); // CRITICAL: Message queue for robust sending
    const [connectionStatus, setConnectionStatus] = useState('Disconnected');
    const [accountInfo, setAccountInfo] = useState({ type: 'N/A', balance: 0.00 });
    const [realtimePrice, setRealtimePrice] = useState(null);
    const [proposal, setProposal] = useState(null);
    const [isRunning, setIsRunning] = useState(false);
    const [isAwaitingTrade, setIsAwaitingTrade] = useState(false);
    const [proposalError, setProposalError] = useState(null);
    const [reconnectAttempt, setReconnectAttempt] = useState(0);

    // --- Dynamic Market/Contract State ---
    const [markets, setMarkets] = useState([]); 
    const [activeContracts, setActiveContracts] = useState({}); 

    // --- Bot Configuration State ---
    const [formState, setFormState] = useState({
        symbol: 'R_100', // Default to Volatility 100 Index
        tradeTypeCategory: 'Up/Down',
        contractType: 'CALL',
        prediction: 3, 
        stake: 0.35, // Base stake
        ticks: 5,
        marginle: 1.5, // Martingale Multiplier
        takeProfit: 2, // Stop condition
        stopLoss: 0.35, // Stop condition
    });
    
    // --- Trading Logic State ---
    const [currentStake, setCurrentStake] = useState(0); // Stake that is actually used for the next trade

    // --- Transaction & History State ---
    const [transactions, setTransactions] = useState([]);
    const initialHistory = [{
        id: 'N/A',
        ts: new Date().toISOString().replace('T', ' | ').split('.')[0] + ' GMT', 
        text: 'System Initialized. Attempting to connect to the Deriv API...',
        accType: 'N/A',
        stake: 0.00,
        pnl: 0.00,
        entrySpot: 'N/A',
        exitSpot: 'N/A'
    }];
    const [history, setHistory] = useState(initialHistory);

    // Helper function to calculate total P&L from transactions
    const calculateTotalPL = useCallback((txns) => {
        return txns.reduce((sum, t) => sum + Number(t.pnl), 0);
    }, []);

    // Robust Message Sender with Queue
    const flushQueue = useCallback(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            if (messageQueueRef.current.length > 0) {
                while (messageQueueRef.current.length > 0) {
                    const message = messageQueueRef.current.shift();
                    wsRef.current.send(JSON.stringify(message));
                }
            }
        }
    }, []);

    const safeSend = useCallback((message) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
        } else {
            // Queue the message for later sending
            messageQueueRef.current.push(message);
        }
    }, []);

    const handleMockApiResponse = useCallback((response) => {
        const data = JSON.parse(response.data);
        const now = new Date().toISOString().replace('T', ' | ').split('.')[0] + ' GMT';
        
        // Handle Active Symbols (Market Data)
        if (data.msg_type === 'active_symbols' && data.active_symbols) {
            const symbols = data.active_symbols
                .filter(s => s.market !== 'random_index' && s.is_trading_supported) // Filter for tradable symbols
                .map(s => ({ name: s.display_name, symbol: s.symbol, market: s.market }));
            
            setMarkets(symbols);

            if (symbols.length > 0) {
                const initialSymbol = symbols.find(s => s.symbol === formState.symbol)?.symbol || symbols[0].symbol;
                setFormState(prev => ({ ...prev, symbol: initialSymbol }));
                
                safeSend({ contracts_for_symbol: initialSymbol }); 
                
                setHistory(h => [{id: 'N/A', ts: now, text: `Markets loaded. Selected: ${initialSymbol}. Requesting contracts...`, accType: accountInfo.type, stake: 0, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);
            } else {
                 setHistory(h => [{id: 'N/A', ts: now, text: `Error: No active symbols available from API.`, accType: accountInfo.type, stake: 0, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);
            }
        
        // Handle Contracts for Symbol (Trade Types)
        } else if (data.msg_type === 'contracts_for_symbol' && data.contracts_for_symbol) {
            const availableContracts = data.contracts_for_symbol.available;
            
            const groupedContracts = availableContracts.reduce((acc, contract) => {
                const category = CONTRACT_GROUPS[contract.contract_type] || 'Others';
                if (!acc[category]) {
                    acc[category] = { types: [], details: {} };
                }
                const predictionRequired = contract.barrier_category?.includes('digit') || contract.barrier_category?.includes('range') || contract.contract_type.startsWith('DIGIT') || contract.contract_type.includes('SPREAD');
                
                acc[category].types.push({
                    text: contract.contract_display,
                    value: contract.contract_type,
                    predictionRequired: predictionRequired,
                    durationUnit: contract.duration_unit,
                    minDuration: contract.min_duration,
                    maxDuration: contract.max_duration,
                });
                return acc;
            }, {});
            
            setActiveContracts(groupedContracts);
            
            const firstCategory = Object.keys(groupedContracts).includes(formState.tradeTypeCategory) ? formState.tradeTypeCategory : Object.keys(groupedContracts)[0];
            if (firstCategory) {
                const firstContractType = groupedContracts[firstCategory].types.find(c => c.value === formState.contractType)?.value || groupedContracts[firstCategory].types[0].value;
                setFormState(prev => ({ 
                    ...prev, 
                    tradeTypeCategory: firstCategory, 
                    contractType: firstContractType,
                }));
            }
            setHistory(h => [{id: 'N/A', ts: now, text: `Contracts loaded for ${formState.symbol}. Ready to trade.`, accType: accountInfo.type, stake: 0, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);

        // Handle Balance Stream
        } else if (data.msg_type === 'balance' && data.balance) {
            // Note: In a real app, this updates the balance stream
            // Here, we just use the mock initial balance unless a trade occurs.
            setAccountInfo(prev => ({ ...prev, balance: data.balance.balance }));


        // Handle Tick Stream
        } else if (data.msg_type === 'tick' && data.tick) {
            setRealtimePrice(data.tick.quote);

        // Handle Proposal Response
        } else if (data.msg_type === 'proposal' && data.proposal) {
            // Update proposal only if the amount matches the current stake
            if (Number(data.proposal.amount).toFixed(2) === Number(currentStake || formState.stake).toFixed(2)) {
                setProposal(data.proposal);
                setProposalError(null);
            }
            
        } else if (data.msg_type === 'proposal' && data.error) {
            setProposal(null);
            setProposalError(data.error.message);
            setHistory(h => [{id: 'N/A', ts: now, text: `Proposal Failed: ${data.error.message}`, accType: accountInfo.type, stake: currentStake, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);
        
        // Handle Buy Response (Trade Execution)
        } else if (data.msg_type === 'buy' && data.buy) {
            setIsAwaitingTrade(false);
            const contract = data.buy.contract_id;
            const entryPrice = data.buy.buy_price;

            setHistory(h => [{id: contract, ts: now, text: `Contract purchased @ ${entryPrice} for $${Number(currentStake).toFixed(2)}. ID: ${contract}`, accType: accountInfo.type, stake: currentStake, pnl: 0, entrySpot: entryPrice, exitSpot: 'N/A'}, ...h]);
            
            // --- MOCK TRADE SETTLEMENT (Simulated Payout/Loss) ---
            const currentContractDetails = activeContracts[formState.tradeTypeCategory]?.types.find(c => c.value === formState.contractType);
            const duration = currentContractDetails?.durationUnit === 't' ? formState.ticks : 5; // Default to 5 seconds if not ticks
            
            setTimeout(() => {
                const isWin = Math.random() > 0.5;
                const exitPrice = (Number(entryPrice) + (isWin ? 0.05 : -0.05)).toFixed(2);
                const payout = data.buy.payout || (Number(currentStake) * 1.8); // Mock Payout
                const pnl = isWin ? payout - data.buy.buy_price : -data.buy.buy_price;
                const result = isWin ? 'Profit' : 'Loss';

                // Update balance
                setAccountInfo(prev => ({ ...prev, balance: prev.balance + pnl }));

                // 1. UPDATE MARTINGALE STAKE & CHECK LIMITS
                let newStake = currentStake;
                let stopReason = null;

                setTransactions(t => {
                    const transaction = {
                        id: contract,
                        type: formState.contractType,
                        entry: Number(entryPrice).toFixed(2),
                        exit: Number(exitPrice).toFixed(2),
                        stake: Number(currentStake).toFixed(2),
                        result: result,
                        pnl: pnl,
                    };
                    
                    const updatedTransactions = [transaction, ...t];
                    const newTotalPL = calculateTotalPL(updatedTransactions);
                    
                    // Martingale Logic
                    if (isWin) {
                        // Win: Reset to base stake
                        newStake = Number(formState.stake);
                        setHistory(h => [{id: 'N/A', ts: now, text: `Win! Stake reset to $${newStake.toFixed(2)}.`, accType: accountInfo.type, stake: 0, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);
                    } else {
                        // Loss: Apply Martingale multiplier
                        newStake = Number((newStake * Number(formState.marginle)).toFixed(2));
                        setHistory(h => [{id: 'N/A', ts: now, text: `Loss. Stake increased to $${newStake.toFixed(2)}.`, accType: accountInfo.type, stake: 0, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);
                    }
                    
                    // Stop Condition Check
                    if (isRunning) { 
                        if (newTotalPL >= Number(formState.takeProfit)) {
                            stopReason = `*** BOT STOPPED *** Take Profit hit! P&L: $${newTotalPL.toFixed(2)}`;
                        } else if (newTotalPL <= -Number(formState.stopLoss)) {
                            stopReason = `*** BOT STOPPED *** Stop Loss hit! P&L: $${newTotalPL.toFixed(2)}`;
                        }
                    }
                    
                    return updatedTransactions;
                });
                
                // Final state updates
                setCurrentStake(newStake);
                
                if (stopReason) {
                    setIsRunning(false);
                    setHistory(h => [{id: 'N/A', ts: now, text: stopReason, accType: accountInfo.type, stake: 0, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);
                }
                
                setHistory(h => [{id: contract, ts: new Date().toISOString().replace('T', ' | ').split('.')[0] + ' GMT', text: `Contract settled: ${result} of ${pnl.toFixed(2)} USD`, accType: accountInfo.type, stake: currentStake, pnl: pnl, entrySpot: entryPrice, exitSpot: exitPrice}, ...h]);


            }, duration * 1000 + 1000); 

        } else if (data.msg_type === 'buy' && data.error) {
            setIsAwaitingTrade(false);
            setHistory(h => [{id: 'N/A', ts: now, text: `Trade failed: ${data.error.message}`, accType: accountInfo.type, stake: currentStake, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);
        }
        // Handle generic error responses
        else if (data.error && data.error.message) {
            console.error('API Generic Error:', data.error.message, data.error);
            setHistory(h => [{id: 'N/A', ts: now, text: `API Error: ${data.error.message}`, accType: accountInfo.type, stake: 0, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);
        }

    }, [formState.symbol, formState.stake, formState.ticks, formState.contractType, formState.marginle, formState.takeProfit, formState.stopLoss, accountInfo.type, activeContracts, safeSend, flushQueue, currentStake, isRunning, transactions, calculateTotalPL]);
    

    // Initialize/Reset currentStake when base stake changes
    useEffect(() => {
        setCurrentStake(Number(formState.stake));
    }, [formState.stake]);
    
    // --- CRITICAL FIX: API Connection and Reconnection useEffect (Auto-Connect) ---
    useEffect(() => {
        // 1. If status is already Connected or Connecting, do nothing.
        if (connectionStatus === 'Connected' || connectionStatus === 'Connecting') return;
        
        // 2. Exponential Backoff: 1s, 2s, 4s, 8s, 16s, 30s max
        const calculatedDelay = Math.min(Math.pow(2, reconnectAttempt) * 1000, 30000); 
        const delay = reconnectAttempt === 0 ? 0 : calculatedDelay; 

        if (delay > 0) {
            setConnectionStatus(`Retrying in ${delay / 1000}s`);
        }
        
        const attemptConnect = setTimeout(() => {
            
            // Close existing connection if it's not already closed
            if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
                wsRef.current.close();
            }

            setConnectionStatus('Connecting');
            
            wsRef.current = new WebSocket(API_URL);
            
            wsRef.current.onopen = () => {
                setConnectionStatus('Connected');
                setReconnectAttempt(0); // Reset retry count on successful socket connection

                // --- MOCK AUTH SUCCESS ---
                const type = 'Demo'; 
                setAccountInfo({ type: type, balance: 5000.00 }); 
                
                // Subscribe to Balance and Ticks, request Active Symbols
                safeSend({ balance: 1, subscribe: 1 });
                safeSend({ active_symbols: 'brief' }); 
                safeSend({ ticks: formState.symbol, subscribe: 1 });
                
                setHistory(h => [{id: 'N/A', ts: new Date().toISOString().replace('T', ' | ').split('.')[0] + ' GMT', text: `Connection successful. Trading as ${type} account. Requesting markets...`, accType: type, stake: 0, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);
                flushQueue(); 
                // --- END MOCK AUTH ---

            };
            
            wsRef.current.onmessage = handleMockApiResponse;
            
            wsRef.current.onclose = () => {
                const now = new Date().toISOString().replace('T', ' | ').split('.')[0] + ' GMT';
                setConnectionStatus('Disconnected');
                setIsRunning(false);
                setHistory(h => [{id: 'N/A', ts: now, text: 'WebSocket connection closed. Retrying...', accType: 'N/A', stake: 0, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);
                setReconnectAttempt(r => r + 1); // Trigger retry
            };

            wsRef.current.onerror = (error) => {
                setConnectionStatus('Error');
                setIsRunning(false);
                setReconnectAttempt(r => r + 1); 
            };

        }, delay); 

        return () => {
            clearTimeout(attemptConnect);
            if (wsRef.current) {
                wsRef.current.onclose = null; 
                wsRef.current.onerror = null; 
                wsRef.current.close();
            }
        };

    }, [reconnectAttempt, safeSend, handleMockApiResponse, connectionStatus, formState.symbol, flushQueue]);


    // --- Proposal Request useEffect (runs when config changes) ---
    const currentContract = activeContracts[formState.tradeTypeCategory]?.types.find(c => c.value === formState.contractType);
    const durationUnit = currentContract?.durationUnit || 't'; 
    
    useEffect(() => {
        // Only send proposal request if connected and not waiting for a trade
        if (connectionStatus !== 'Connected' || isAwaitingTrade || !formState.contractType) return;

        // Construct the proposal request
        const proposalRequest = {
            proposal: 1,
            // CRITICAL: Use currentStake for the proposal amount
            amount: Number(currentStake) > 0 ? Number(currentStake) : Number(formState.stake), 
            basis: 'stake',
            contract_type: formState.contractType,
            currency: 'USD',
            duration: formState.ticks,
            duration_unit: durationUnit, 
            symbol: formState.symbol,
        };

        // Add prediction (barrier) for relevant contract types
        if (currentContract?.predictionRequired || formState.contractType.startsWith('DIGIT')) {
             proposalRequest.barrier = formState.prediction;
        }

        // Debounce proposal request
        const debounce = setTimeout(()=> {
            safeSend(proposalRequest);
        }, 500);

        return () => clearTimeout(debounce);
        
    }, [formState.stake, formState.contractType, formState.ticks, formState.prediction, formState.symbol, connectionStatus, isAwaitingTrade, safeSend, durationUnit, currentContract?.predictionRequired, currentStake]);


    // --- Trading Logic ---
    const executeTrade = useCallback(() => {
        if (!isRunning || !proposal || isAwaitingTrade || !currentContract || connectionStatus !== 'Connected') return;

        const tradeAmount = currentStake; 
        
        setIsAwaitingTrade(true);
        setHistory(h => [{id: 'N/A', ts: new Date().toISOString().replace('T', ' | ').split('.')[0] + ' GMT', text: `Attempting to buy contract with stake $${Number(tradeAmount).toFixed(2)}...`, accType: accountInfo.type, stake: tradeAmount, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);

        // Use safeSend to ensure the buy request is queued if the connection is briefly interrupted
        safeSend({ buy: proposal.id, price: proposal.ask_price });

    }, [isRunning, proposal, isAwaitingTrade, currentStake, accountInfo.type, currentContract, safeSend, connectionStatus]);

    // Continuous trading loop
    useEffect(() => {
        if (isRunning && proposal && !isAwaitingTrade && connectionStatus === 'Connected') {
            executeTrade();
        }
    }, [isRunning, proposal, executeTrade, isAwaitingTrade, connectionStatus]);

    
    // --- State Change Handlers ---
    const handleFormChange = (e) => {
        const { name, value } = e.target;

        setFormState(prev => {
            const newState = { ...prev, [name]: value };

            if (name === 'tradeTypeCategory' && activeContracts[value]?.types.length > 0) {
                newState.contractType = activeContracts[value].types[0].value;
            }

            if (name === 'symbol') {
                // When changing symbol, stop old ticks and request new contract data
                safeSend({ forget_all: 'ticks' });
                safeSend({ contracts_for_symbol: value });
                safeSend({ ticks: value, subscribe: 1 });
            }
            
            return newState;
        });
    };
    
    const resetAll = () => {
        setTransactions([]);
        setHistory(initialHistory);
        // Reset to mock initial balance
        setAccountInfo(prev => ({ ...prev, balance: 5000.00 })); 
        setIsRunning(false);
        setCurrentStake(Number(formState.stake)); // Reset stake on full reset
    };
    
    const toggleRun = () => {
        // Can only run if connected and proposal exists
        if (connectionStatus !== 'Connected' || !proposal) return;

        if(isRunning) {
            setIsRunning(false);
            setHistory(h => [{id: 'N/A', ts: new Date().toISOString().replace('T', ' | ').split('.')[0] + ' GMT', text: 'Bot manually stopped.', accType: accountInfo.type, stake: 0, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);
        } else {
            // START: Reset stake and stats before starting a new run
            setCurrentStake(Number(formState.stake));
            setIsRunning(true);
            setHistory(h => [{id: 'N/A', ts: new Date().toISOString().replace('T', ' | ').split('.')[0] + ' GMT', text: `Bot started on ${formState.symbol} with base stake $${Number(formState.stake).toFixed(2)}.`, accType: accountInfo.type, stake: formState.stake, pnl: 0, entrySpot: 'N/A', exitSpot: 'N/A'}, ...h]);
        }
    };
    
    // --- Derived UI Data ---
    const currentSymbol = markets.find(s => s.symbol === formState.symbol);
    const availableMarkets = [...new Set(markets.map(s => s.market))];
    const availableSymbols = markets.filter(s => s.market === currentSymbol?.market);
    const availableTradeCategories = Object.keys(activeContracts);
    const contractOptions = activeContracts[formState.tradeTypeCategory]?.types || [];
    
    const showPrediction = currentContract?.predictionRequired || false;
    const durationLabel = durationUnit === 't' ? 'Duration (Ticks)' : durationUnit === 'm' ? 'Duration (Minutes)' : durationUnit === 'h' ? 'Duration (Hours)' : 'Duration';


    const totalStats = transactions.reduce((acc, t) => {
        const pnl = Number(t.pnl);
        acc.stake += Number(t.stake);
        acc.payout += Number(t.stake) + pnl;
        acc.runs += 1;
        acc.lost += pnl < 0 ? 1 : 0;
        acc.won += pnl > 0 ? 1 : 0;
        acc.profitLoss += pnl;
        return acc;
    }, { stake: 0, payout: 0, runs: 0, lost: 0, won: 0, profitLoss: 0 });

    const TabButton = ({i,label})=> (
        <button onClick={()=>setIndex(i)} className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${index===i? 'bg-blue-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'}`}>
          {label}
        </button>
      )
    
    const apiStatusColor = connectionStatus === 'Connected' ? 'text-green-400' : 
                          connectionStatus === 'Error' ? 'text-red-400' : 'text-yellow-400';
    
    const currentPriceText = realtimePrice ? Number(realtimePrice).toFixed(currentSymbol?.symbol.includes('frx') ? 5 : 2) : '---';

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#0a111a] p-4 text-white z-50">
            {/* Show/Hide Button */}
            <button
                onClick={() => setIsSliderVisible(!isSliderVisible)}
                className="absolute top-4 right-4 p-2 bg-[#00a79c] text-white rounded-full shadow-lg transition-transform duration-300 z-50"
            >
                {isSliderVisible ? <IconArrowRight /> : <IconArrowLeft />}
            </button>

            <div 
                className={`w-full max-w-md transition-transform duration-300 ease-in-out ${isSliderVisible ? 'translate-x-0' : 'translate-x-[150%]'} `}
            >
                <div className="relative">
                    <div className="rounded-xl shadow-2xl p-5 bg-[#1a222d]">

                        <div className="flex items-center justify-between mb-5">
                            <div className="bg-gray-200 text-gray-900 font-semibold px-4 py-1.5 rounded-full text-lg">Deriv Bot Simulator</div>
                            <div className="text-xs text-gray-500">App ID: 106629</div>
                        </div>

                        {/* === API/Account Status Header === */}
                        <div className="flex items-center justify-between font-semibold border-t border-b border-green-400/30 py-4 mb-4">
                            <div className="text-center">
                                <span className={`block ${apiStatusColor}`}>{connectionStatus}</span>
                                <span className="text-xs text-gray-400">Status</span>
                            </div>
                            <div className="text-center">
                                <span className="block text-green-400">{accountInfo.type}</span>
                                <span className="text-xs text-gray-400">Account</span>
                            </div>
                            <div className="text-center">
                                <span className="block text-green-400">${Number(accountInfo.balance).toFixed(2)}</span>
                                <span className="text-xs text-gray-400">Balance</span>
                            </div>
                        </div>

                        {/* --- Tabs --- */}
                        <div className="flex items-center gap-2 mb-4 bg-[#2a3441] p-1 rounded-lg">
                            <TabButton i={0} label="Bot Config" />
                            <TabButton i={1} label="Transactions" />
                            <TabButton i={2} label="History" />
                        </div>

                        {/* --- Slider Content --- */}
                        <div className="overflow-hidden">
                            <div className="flex transition-transform duration-300 ease-in-out" style={{transform: `translateX(${ -index * 100 }%)`}}>
                            
                            {/* === Panel 1: Bot Configuration === */}
                            <div className="w-full flex-shrink-0">
                                <div className="space-y-3">
                                    
                                    {/* Markets */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <CustomSelect 
                                            label="Market" 
                                            name="market" 
                                            value={currentSymbol?.market || ''} 
                                            onChange={() => {}} 
                                            disabled={connectionStatus !== 'Connected' || markets.length === 0}
                                        >
                                            {availableMarkets.map(m => <option key={m}>{m}</option>)}
                                        </CustomSelect>
                                        <CustomSelect 
                                            label="Symbol" 
                                            name="symbol" 
                                            value={formState.symbol} 
                                            onChange={handleFormChange} 
                                            disabled={connectionStatus !== 'Connected' || markets.length === 0}
                                            labelClass="text-white"
                                        >
                                            {/* Ensure 'loading' state if markets are empty */}
                                            {markets.length === 0 && <option value="">Loading Markets...</option>}
                                            {availableSymbols.map(s => <option key={s.symbol} value={s.symbol}>{s.name}</option>)}
                                        </CustomSelect>
                                        <CustomInput label="Price" value={currentPriceText} type="text" labelClass="text-transparent" readOnly={true} />
                                    </div>

                                    {/* Trade Type and Contract */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <CustomSelect 
                                            label="Trade Category" 
                                            name="tradeTypeCategory" 
                                            value={formState.tradeTypeCategory} 
                                            onChange={handleFormChange}
                                            disabled={connectionStatus !== 'Connected' || availableTradeCategories.length === 0}
                                        >
                                            {/* Ensure 'loading' state if contracts are empty */}
                                            {availableTradeCategories.length === 0 && <option value="">Loading Contracts...</option>}
                                            {availableTradeCategories.map(t => <option key={t}>{t}</option>)}
                                        </CustomSelect>
                                        <CustomSelect 
                                            label="Contract" 
                                            name="contractType" 
                                            value={formState.contractType} 
                                            onChange={handleFormChange}
                                            disabled={connectionStatus !== 'Connected' || contractOptions.length === 0}
                                            labelClass="text-white"
                                        >
                                            {contractOptions.map(c => <option key={c.value} value={c.value}>{c.text}</option>)}
                                        </CustomSelect>
                                        
                                        {/* Conditional Prediction Field */}
                                        {showPrediction ? (
                                            <CustomInput label="Barrier/Prediction" name="prediction" value={formState.prediction} onChange={handleFormChange} min={0} max={9} step={1} />
                                        ) : (
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-sm font-medium text-gray-600">Barrier/Prediction</label>
                                                <div className="bg-[#2a3441]/50 border border-[#455263]/50 text-gray-500 text-sm rounded-md px-3 py-1.5 h-[35px] flex items-center">
                                                    N/A
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Financial Config (Base Stake) */}
                                    <div className="grid grid-cols-3 gap-3 pt-2">
                                        <CustomInput label="Base Stake" name="stake" value={formState.stake} onChange={handleFormChange} />
                                        <CustomInput label={durationLabel} name="ticks" value={formState.ticks} onChange={handleFormChange} min={1} step={durationUnit === 't' ? 1 : 0.01} />
                                        <CustomInput label="Martingale Multiplier" name="marginle" value={formState.marginle} onChange={handleFormChange} step={0.1} min={1.1} />
                                    </div>
                                    
                                    {/* Stop Conditions */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <CustomInput label="Take Profit ($)" name="takeProfit" value={formState.takeProfit} onChange={handleFormChange} min={0.01} />
                                        <CustomInput label="Stop Loss ($)" name="stopLoss" value={formState.stopLoss} onChange={handleFormChange} min={0.01} />
                                        <CustomInput label="Current Stake" name="currentStake" value={Number(currentStake).toFixed(2)} type="text" readOnly={true} labelClass="text-cyan-300" />
                                    </div>

                                <div className="pt-4 space-y-3">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-400 truncate pr-2">Symbol: **{currentSymbol?.name || 'N/A'}**</span>
                                        <span className="text-gray-400 truncate text-right pl-2">Contract: **{currentContract?.text || 'N/A'}**</span>
                                    </div>
                                    
                                    {proposalError && <div className="text-red-500 text-xs italic">Proposal Error: {proposalError}</div>}
                                    
                                    <div className="grid grid-cols-2 gap-3 text-sm border-t border-gray-700 pt-3">
                                        <div>
                                            <div className="text-gray-400">Potential Profit</div>
                                            <div className="font-semibold text-green-500">
                                                {proposal ? `+${(proposal.payout - proposal.ask_price).toFixed(2)}` : '---'}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-gray-400">Contract Value (Cost)</div>
                                            <div className="font-semibold text-white">{proposal ? Number(proposal.ask_price).toFixed(2) : '---'}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 flex items-center gap-3">
                                    <button 
                                        onClick={toggleRun} 
                                        disabled={connectionStatus !== 'Connected' || isAwaitingTrade || !proposal}
                                        className={`px-6 py-2.5 rounded-md font-semibold flex items-center justify-center gap-2 transition-all w-2/5
                                        ${isRunning ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-[#00a79c] text-white hover:bg-[#009287]'} 
                                        ${(connectionStatus !== 'Connected' || isAwaitingTrade || !proposal) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <IconPlay />
                                        {isRunning ? 'Stop' : 'Run'}
                                    </button>
                                    <div className="flex-1 h-10 bg-[#2a3441] border border-[#455263] rounded-md relative overflow-hidden">
                                        <div className="absolute left-0 top-0 h-full bg-[#00a79c]/30" style={{width: isRunning ? '60%' : '10%'}}></div>
                                        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                                            {isRunning ? (isAwaitingTrade ? 'Awaiting Contract...' : 'Bot Running') : 'Bot Paused'}
                                        </div>
                                    </div>
                                </div>

                                </div>
                            </div>

                            {/* === Panel 2: Transactions === */}
                            <div className="w-full flex-shrink-0">
                                <div className="space-y-2">
                                    <div className="mb-3 grid grid-cols-3 gap-2 text-sm text-cyan-300 font-semibold">
                                        <div>ID/Type</div>
                                        <div>Entry/Exit Spot</div>
                                        <div className="text-right">Stake/P&L</div>
                                    </div>

                                    <div className="space-y-2 max-h-[360px] overflow-auto">
                                        {transactions.map(t=> (
                                        <div key={t.id} className="grid grid-cols-3 gap-2 items-center text-sm border-b border-gray-700/50 pb-2">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-semibold text-xs truncate">{t.id}</span>
                                                <div className="flex items-center text-xs gap-1">
                                                    {t.result === 'Profit' ? <IconRise /> : <IconFall />}
                                                    <span>{t.type}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="text-white text-xs">
                                                <div>Entry: {t.entry}</div>
                                                <div>Exit: {t.exit}</div>
                                            </div>
                                            
                                            <div className="text-right">
                                                <div className="font-semibold text-xs">{Number(t.stake).toFixed(2)} USD</div>
                                                <div className={`font-medium text-sm ${t.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {t.pnl >= 0 ? '+' : ''}{Number(t.pnl).toFixed(2)}
                                                </div>
                                            </div>
                                        </div>
                                        ))}
                                        {transactions.length === 0 && <div className="text-center text-gray-500 py-10">No transactions recorded yet.</div>}
                                    </div>

                                    <div className="pt-4 grid grid-cols-3 gap-3 text-sm border-t border-gray-700/50">
                                        <div>
                                            <div className="text-gray-400">Total stake</div>
                                            <div className="text-white font-semibold">{totalStats.stake.toFixed(2)} USD</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-400">Contracts won</div>
                                            <div className="text-green-500 font-semibold">{totalStats.won}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-gray-400">Total profit/loss</div>
                                            <div className={`font-semibold ${totalStats.profitLoss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                {totalStats.profitLoss >= 0 ? '+' : ''}{totalStats.profitLoss.toFixed(2)} USD
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4">
                                        <button onClick={resetAll} className="w-full py-2.5 bg-transparent border border-[#00a79c] text-[#00a79c] rounded-md font-semibold hover:bg-[#00a79c]/10 transition-colors">
                                            Reset Transactions & History
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* === Panel 3: History (Restructured) === */}
                            <div className="w-full flex-shrink-0">
                                <div className="space-y-4">
                                    <div className="space-y-2 max-h-[420px] overflow-auto">
                                        {history.map((h,i)=> (
                                        <div key={i} className="bg-[#2a3441] p-3 rounded-md text-sm">
                                            <div className="text-gray-300">{h.text}</div>
                                            <div className="text-xs text-gray-400 mt-1.5">{h.ts}</div>
                                            
                                            {h.id !== 'N/A' && (
                                                <div className="mt-2 pt-2 border-t border-gray-500/30 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                                    <div>
                                                        <span className="text-gray-400">ID: </span>
                                                        <span className="text-white truncate">{h.id}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-400">Acct: </span>
                                                        <span className="text-white">{h.accType}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-400">P/L: </span>
                                                        <span className={h.pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                                                            {h.pnl >= 0 ? '+' : ''}{Number(h.pnl).toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-400">Entry: </span>
                                                        <span className="text-white">{h.entrySpot}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        )).reverse()}
                                    </div>
                                </div>
                            </div>

                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    )
}
