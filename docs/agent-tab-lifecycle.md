
## New agent tab lifecycle

0. [UI] Agent tab is created
0. [Client] An envelope is sent to the ymir server instructing it to spawn a new agent tab (contains worktree id).
0. [Server] Receives and decodes the envelope: A new tab is requested
0. [Server] A new tab is created and its state is stored in the db. No session id or process id is stored yet.
0. [Server] A new ACP agent process must be spawned according to the current worktree/workspace settings. A new process spawns and the server waits to connect
0. [Server] Sends the new agent tab information including the process ID and status: waiting for agent. 
0. [Client] Receives and decodes the new agent tab information and updates the status.
0. [UI] Updates the rendered agent tab content to show "Agent is spawning"
0. [Server] The ACP agent connects
0. [Server] Sends the initialize event to the ACP agent (https://agentclientprotocol.com/protocol/initialization) which replies with its capabilities
0. [Server] Sends the response of the initialize event over the ACP proxy
0. [Client] Receives the response of the initialize event through the ACP proxy
0. [Server] Sends the new session event to the ACP agent (https://agentclientprotocol.com/protocol/session-setup) which replies with the new session ID. 
0. [Server] Sends the response of the new session event over the ACP proxy (This MAY contain session "modes": https://agentclientprotocol.com/protocol/session-modes, and "slash commands": https://agentclientprotocol.com/protocol/slash-commands)
0. [Server] Sends the agent tab status in the bridge envelope (not ACP proxy) which should include the agent tab id, process ID, and the new session ID
0. [Client] Receives the response of the new session event through the ACP proxy
0. [Client] Receives the agent tab status with all 3 ids
0. [Server] Sends the session/list event (https://agentclientprotocol.com/protocol/session-list) to the ACP agent which replies with the session list
0. [Server] Sends the response of the session/list event over the ACP proxy
0. [Client] Receives the session list response

The server and client should now have: a new session id, a list of modes, a list of slash commands, a list of models?, a list of sessions


## Resume agent tab lifecycle
(very similar to new agent tab, but with session loading instead of new session creation)

0. [UI] Agent tab content mounts
0. [Client] An envelope is sent to the ymir server instructing it that the agent tab has loaded and is awaiting connection to the agent
0. [Server] Receives and decodes the envelope: A resumed tab is requested
0. [Server] The agent tab is loaded from the database. Process ID is set to null
0. [Server] A new ACP agent process must be spawned according to the current worktree/workspace settings. A new process spawns and the server waits to connect
0. [Server] Sends the agent tab information including the process ID and status: waiting for agent. 
0. [Client] Receives and decodes the agent tab information and updates the status.
0. [UI] Updates the rendered agent tab content to show "Agent is spawning"
0. [Server] The ACP agent connects
0. [Server] Sends the initialize event to the ACP agent (https://agentclientprotocol.com/protocol/initialization) which replies with its capabilities
0. [Server] Sends the response of the initialize event over the ACP proxy
0. [Client] Receives the response of the initialize event through the ACP proxy
0. [Server] Sends the LOAD session event to the ACP agent (https://agentclientprotocol.com/protocol/session-setup) with the session ID loaded from the database. The ACP agent begins sending session/update events. 
0. [Server] Sends the response of the load session event over the ACP proxy (This MAY contain session "modes": https://agentclientprotocol.com/protocol/session-modes, and "slash commands": https://agentclientprotocol.com/protocol/slash-commands)
0. [Server] Begins receiving session/update events from the agent loading the session history
0. [Server] Sends each session/update event over the ACP proxy
0. [Client] Receives each session/update event over the ACP proxy
0. [Client] Updates the renderable state through acp-chat-core
0. [UI] Each renderable item in the thread can begin rendering
0. [Server] (meanwhile) Sends the session/list event (https://agentclientprotocol.com/protocol/session-list) to the ACP agent which replies with the session list
0. [Server] Sends the response of the session/list event over the ACP proxy
0. [Client] Receives the session list response

The server and client should now have: the session ID, a list of modes, a list of slash commands, a list of models?, a list of sessions, the current session's history