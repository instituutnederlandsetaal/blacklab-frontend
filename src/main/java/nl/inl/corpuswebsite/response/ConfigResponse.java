package nl.inl.corpuswebsite.response;

import java.io.IOException;
import java.io.OutputStreamWriter;

import com.squareup.moshi.*;
import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.utils.GlobalConfig;

/** Show the about page. */
public class ConfigResponse extends BaseResponse {
    public static class PublicConfigAdapter extends JsonAdapter<GlobalConfig> {
        @Override
        public GlobalConfig fromJson(JsonReader reader) throws IOException {
            // Implement deserialization logic if needed
            return null;
        }

        @Override
        public void toJson(JsonWriter writer, GlobalConfig value) throws IOException {
            writer.beginObject();
            writer.name("BLS_URL").value(value.get(GlobalConfig.Keys.BLS_URL_ON_CLIENT));
            writer.name("commit_hash").value(GlobalConfig.commitHash);
            writer.name("commit_time").value(GlobalConfig.commitTime);
            writer.name("commit_message").value(GlobalConfig.commitMessage);
            writer.name("version").value(GlobalConfig.version);
            writer.name("branch").value(GlobalConfig.branch);
            writer.endObject();
        }
    }
    
    public ConfigResponse() {
        super("config", false);
    }

    @Override
    protected void completeRequest() {
        response.setCharacterEncoding(OUTPUT_ENCODING);
        response.setContentType("application/json");

        try (OutputStreamWriter osw = new OutputStreamWriter(response.getOutputStream(), OUTPUT_ENCODING)) {
            GlobalConfig globalConfig = servlet.getGlobalConfig();
            Moshi moshi = new Moshi.Builder().add(new PublicConfigAdapter()).build();
            String json = moshi.adapter(GlobalConfig.class).toJson(globalConfig);
            osw.write(json);
            osw.flush();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
