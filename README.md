# 📱 PhoneAI - Elite Technical Smartphone Advisor

## 📖 Project Overview
**PhoneAI** is an elite, highly technical multimodal AI chatbot designed to act as an expert smartphone advisor. Built as a final bootcamp project, it utilizes a Retrieval-Augmented Generation (RAG) architecture to answer user questions by analyzing tech review videos from YouTube. By combining natural language processing, modern agentic workflows, and speech recognition/synthesis, PhoneAI delivers accurate, context-aware smartphone recommendations.

## 💼 Business Case & Value
Building a chatbot that translates YouTube video content into an interactive QA system offers several compelling business advantages:
* **Enhanced Accessibility:** The integration of audio inputs (Speech-to-Text) and outputs (Text-to-Speech) broadens the audience reach, specifically assisting users with visual or hearing impairments.
* **Efficient Search & Indexing:** It allows users to instantly find specific technical specifications hidden within hours of video content.
* **Next-Gen Customer Support:** By leveraging existing video reviews, the bot provides instant, accurate responses to tech queries, demonstrating a highly scalable customer support solution.

## 📁 Project Structure & Core Files
The project is built around a split-development workflow:

* `main_notebook.ipynb`: **This is the core development file of the project.** It contains the entire logic, the data extraction pipeline, the Pinecone vectorization, the LangGraph agent creation, and the Gradio prototyping interface.
* `main.py`: **This is an auto-generated script specifically for production deployment.** It wraps the LangGraph agent built in the notebook into a FastAPI backend to serve the premium web interface.
* `static/`: Contains the frontend assets for the premium UI (`index.html`, `style.css`, `script.js`).
* `.env`: Environment variables configuration file.
* `requirements.txt`: Python dependencies.

## 🚀 Key Features
* **Multimodal Interface:** Users can interact with the bot by typing text or speaking directly through their microphone.
* **Token-by-Token Streaming:** Direct real-time streaming of response tokens from the LangGraph agent via Server-Sent Events (SSE).
* **Agentic Decision Making:** The AI autonomously decides whether to search the vector database for smartphone specs or use its internal knowledge for general conversation.
* **Short-Term Session Memory:** Memory management powered by LangGraph's in-memory `MemorySaver` checkpointer.

## 🛠️ Architecture & Tech Stack
* **Language:** Python 3.10+
* **LLM & Embeddings:** OpenAI `gpt-4o-mini`, `text-embedding-ada-002`
* **Agent Framework:** LangGraph (`create_react_agent`) & LangChain Core
* **Vector Database:** Pinecone (Serverless AWS us-east-1)
* **Audio Processing:** OpenAI Whisper (`whisper-1`) for STT, OpenAI TTS (`tts-1`, 'alloy' voice) for auto-playing voice responses.
* **Observability:** LangSmith for end-to-end tracing.

---

## ⚙️ How to Run & Deploy the Application

PhoneAI offers **two different deployment methods** depending on your needs. 

### Method 1: Premium Custom UI via FastAPI (🌟 RECOMMENDED)
This is the recommended deployment method. It combines a state-of-the-art FastAPI backend with a high-fidelity, Google Gemini-inspired dark mode frontend. It supports seamless background Text-to-Speech and sleek chat bubbles.

**Local Setup:**
1. Install dependencies: `pip install -r requirements.txt`
2. Configure your `.env` file with `OPENAI_API_KEY`, `PINECONE_API_KEY`, and LangSmith keys.
3. Start the FastAPI server using the auto-generated deployment script:
   ```bash
   uvicorn main:app --reload
   ```
4. Open your browser and navigate to: `http://localhost:8000`

**Cloud Deployment (Split-Deployment):**
Deploy the `main.py` backend to a Python-friendly cloud provider (like Render, Railway, or a VPS). Update the API endpoint URL at the top of your `static/script.js` file, and upload the `static/` folder to any standard FTP server or static hosting service (like Vercel).

### Method 2: Gradio Interface Prototyping
If you want to quickly test the application's logic or debug the agent without launching a full web server, you can use the built-in Gradio interface directly from the main notebook.

1. Open `main_notebook.ipynb` in Jupyter or VS Code.
2. Run all the cells to initialize the data and the LangGraph agent.
3. The final cell will launch a local Gradio server (typically accessible at `http://127.0.0.1:7860`), providing a simple unified input bar for testing text and Whisper audio interactions.
