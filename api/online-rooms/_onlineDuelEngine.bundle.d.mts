import type { Request, Response } from 'express';

export declare function clearOnlineDuelCachesForTest(): void;
export declare function handleCreateOnlineRoom(req: Request, res: Response): Promise<void>;
export declare function handleJoinOnlineRoom(req: Request, res: Response): Promise<void>;
export declare function handlePresenceUpdate(req: Request, res: Response): Promise<void>;
export declare function handleLeaveOnlineRoom(req: Request, res: Response): Promise<void>;
export declare function handleToggleCategoryPick(req: Request, res: Response): Promise<void>;
export declare function handleConfirmCategories(req: Request, res: Response): Promise<void>;
export declare function handleStartOnlineMatch(req: Request, res: Response): Promise<void>;
export declare function handleSelectQuestion(req: Request, res: Response): Promise<void>;
export declare function handleSubmitAnswer(req: Request, res: Response): Promise<void>;
export declare function handleTimeoutOrSkipQuestion(req: Request, res: Response): Promise<void>;
export declare function handleDismissResolvedQuestion(req: Request, res: Response): Promise<void>;
export declare function handleWalaKalimaSyncState(req: Request, res: Response): Promise<void>;
export declare function handleWalaKalimaCommit(req: Request, res: Response): Promise<void>;
export declare function handleFinishOnlineMatch(req: Request, res: Response): Promise<void>;
export declare function handleRestartOnlineMatch(req: Request, res: Response): Promise<void>;
export declare function handleClaimHostRole(req: Request, res: Response): Promise<void>;
