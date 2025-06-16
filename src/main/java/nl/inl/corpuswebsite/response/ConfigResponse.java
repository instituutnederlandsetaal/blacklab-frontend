package nl.inl.corpuswebsite.response;

import java.io.OutputStreamWriter;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonSerializer;
import com.google.gson.annotations.Expose;
import com.google.gson.annotations.SerializedName;

import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.utils.GlobalConfig;

/** Show the about page. */
public class ConfigResponse extends BaseResponse {

    private static class PublicConfig implements JsonSerializer<GlobalConfig> {
        private final transient GlobalConfig config; // Mark as transient to exclude from serialization

        public PublicConfig(GlobalConfig config) {
            this.config = config;
        }

        public String serializeToJson() {
            return new Gson().toJson(this.serialize(config, GlobalConfig.class, null));
        }

        @Override
        public JsonElement serialize(GlobalConfig config, java.lang.reflect.Type typeOfSrc, com.google.gson.JsonSerializationContext context) {
            JsonObject jsonObject = new JsonObject();
            jsonObject.addProperty("BLS_URL", config.get(GlobalConfig.Keys.BLS_URL_ON_CLIENT));
            jsonObject.addProperty("commit_hash", GlobalConfig.commitHash);
            jsonObject.addProperty("commit_time", GlobalConfig.commitTime);
            jsonObject.addProperty("commit_message", GlobalConfig.commitMessage);
            jsonObject.addProperty("version", GlobalConfig.version);
            return jsonObject;
        }
    }
    
    public ConfigResponse() {
        super("config", false);
    }

    @Override
    protected void completeRequest() {
        response.setCharacterEncoding(OUTPUT_ENCODING);
        response.setContentType("application/json");

        // Merge context into the page template and write to output stream
        try (OutputStreamWriter osw = new OutputStreamWriter(response.getOutputStream(), OUTPUT_ENCODING)) {   
            osw.append(new PublicConfig(servlet.getGlobalConfig()).serializeToJson());
            osw.flush();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
